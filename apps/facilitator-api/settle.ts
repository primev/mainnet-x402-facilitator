import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { usdcAbi } from './abi.js'
import {
  RELAY_PRIVATE_KEY,
  RPC_URL,
  USDC_ADDRESS,
  NETWORK,
  FASTRPC_URL,
} from './config.js'
import { verifyPayment } from './verify.js'
import type { PaymentPayload, PaymentRequirements, SettleResponse } from './types.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]+$/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_NONCE_RETRIES = 3

function getClients() {
  const account = privateKeyToAccount(RELAY_PRIVATE_KEY())

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL()),
  })

  // FastRPC for preconfirmed settlement (priority fees covered by mev-commit)
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: http(FASTRPC_URL),
    account,
  })

  return { publicClient, walletClient, account }
}

function splitSignature(signature: string): { v: number; r: Hex; s: Hex } {
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature
  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: expected 130 hex chars, got ${sig.length}`)
  }
  const r = `0x${sig.slice(0, 64)}` as Hex
  const s = `0x${sig.slice(64, 128)}` as Hex
  const v = parseInt(sig.slice(128, 130), 16)
  if (v !== 27 && v !== 28) {
    throw new Error(`Invalid signature v value: ${v}`)
  }
  return { v, r, s }
}

async function fetchNonceFromFastRPC(address: string): Promise<number> {
  const response = await fetch(FASTRPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionCount',
      params: [address, 'pending'],
    }),
  })

  const result = await response.json()

  if (result.error) {
    throw new Error(`FastRPC nonce error: ${result.error.message || JSON.stringify(result.error)}`)
  }
  if (!result.result || !/^0x[0-9a-fA-F]+$/.test(result.result)) {
    throw new Error(`FastRPC returned invalid nonce: ${JSON.stringify(result.result)}`)
  }

  return parseInt(result.result, 16)
}

export async function settlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<SettleResponse> {
  // Verify first
  const verification = await verifyPayment(paymentPayload, paymentRequirements)
  if (!verification.isValid) {
    return {
      success: false,
      error: verification.invalidReason,
      payer: verification.payer,
    }
  }

  const { authorization, signature } = paymentPayload.payload

  // Validate inputs before processing
  const from = authorization.from as Address
  const to = authorization.to as Address

  if (!ADDRESS_RE.test(from) || from === ZERO_ADDRESS) {
    return { success: false, error: 'invalid_from_address', payer: from }
  }
  if (!ADDRESS_RE.test(to) || to === ZERO_ADDRESS) {
    return { success: false, error: 'invalid_to_address', payer: from }
  }
  if (!HEX_RE.test(authorization.nonce)) {
    return { success: false, error: 'invalid_authorization_nonce', payer: from }
  }

  let value: bigint
  let validAfter: bigint
  let validBefore: bigint
  try {
    value = BigInt(authorization.value)
    validAfter = BigInt(authorization.validAfter)
    validBefore = BigInt(authorization.validBefore)
  } catch {
    return { success: false, error: 'invalid_numeric_field', payer: from }
  }

  let v: number, r: Hex, s: Hex
  try {
    ;({ v, r, s } = splitSignature(signature))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'invalid_signature_format'
    return { success: false, error: msg, payer: from }
  }

  const nonce = authorization.nonce as Hex
  const { publicClient, walletClient, account } = getClients()

  try {
    // Get gas price from L1 with a 20% buffer to handle base fee increases
    const gasPrice = await publicClient.getGasPrice()
    const bufferedMaxFee = (gasPrice * 120n) / 100n

    // Encode transferWithAuthorization call
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: 'transferWithAuthorization',
      args: [from, to, value, validAfter, validBefore, nonce, v, r, s],
    })

    // Nonce retry loop: FastRPC tracks pending txs in the mev-commit mempool,
    // so fetching 'pending' nonce after each attempt picks up the latest state.
    // If two concurrent requests grab the same nonce, one will fail and retry
    // with a fresh nonce from FastRPC (which now reflects the other's pending tx).
    let lastError = ''
    for (let attempt = 0; attempt < MAX_NONCE_RETRIES; attempt++) {
      const relayNonce = await fetchNonceFromFastRPC(account.address)

      const signedTx = await walletClient.signTransaction({
        account,
        to: USDC_ADDRESS,
        data,
        nonce: relayNonce,
        gas: BigInt(120000),
        maxFeePerGas: bufferedMaxFee,
        maxPriorityFeePerGas: BigInt(0), // mev-commit covers priority fees
        chainId: mainnet.id,
      })

      // Submit via FastRPC
      const response = await fetch(FASTRPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: [signedTx],
        }),
      })

      const result = await response.json()

      if (!result.error) {
        const txHash = result.result as Hex
        return {
          success: true,
          payer: from,
          transaction: txHash,
          network: NETWORK,
          facilitator: {
            agentId: 23175,
            reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
          },
        }
      }

      const errMsg = result.error.message || ''
      // Retry only on nonce-related errors
      if (errMsg.includes('nonce too low') || errMsg.includes('replacement transaction underpriced') || errMsg.includes('already known')) {
        lastError = errMsg
        continue
      }

      // Non-nonce error — fail immediately
      return {
        success: false,
        error: errMsg || 'Transaction submission failed',
        payer: from,
      }
    }

    // Exhausted retries
    return {
      success: false,
      error: `Nonce conflict after ${MAX_NONCE_RETRIES} retries: ${lastError}`,
      payer: from,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      success: false,
      error: message,
      payer: from,
    }
  }
}

export function getRelayAddress(): Address {
  const account = privateKeyToAccount(RELAY_PRIVATE_KEY())
  return account.address
}
