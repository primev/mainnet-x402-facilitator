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
  const r = `0x${sig.slice(0, 64)}` as Hex
  const s = `0x${sig.slice(64, 128)}` as Hex
  const v = parseInt(sig.slice(128, 130), 16)
  return { v, r, s }
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
  const { v, r, s } = splitSignature(signature)

  const from = authorization.from as Address
  const to = authorization.to as Address
  const value = BigInt(authorization.value)
  const validAfter = BigInt(authorization.validAfter)
  const validBefore = BigInt(authorization.validBefore)
  const nonce = authorization.nonce as Hex

  const { publicClient, walletClient, account } = getClients()

  try {
    // Get gas price from L1, but nonce from FastRPC (includes pending txs in mev-commit mempool)
    const [gasPrice, nonceResponse] = await Promise.all([
      publicClient.getGasPrice(),
      fetch(FASTRPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionCount',
          params: [account.address, 'pending'],
        }),
      }).then((r) => r.json()),
    ])

    const relayNonce = parseInt(nonceResponse.result, 16)

    // Encode transferWithAuthorization call
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: 'transferWithAuthorization',
      args: [from, to, value, validAfter, validBefore, nonce, v, r, s],
    })

    // Prepare and sign the transaction
    const signedTx = await walletClient.signTransaction({
      account,
      to: USDC_ADDRESS,
      data,
      nonce: relayNonce,
      gas: BigInt(120000),
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: BigInt(0), // mev-commit covers priority fees
      chainId: mainnet.id,
    })

    // Submit via FastRPC and return immediately (fire-and-forget)
    // mev-commit preconfirmation guarantees inclusion when proposer is opted in
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

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Transaction submission failed',
        payer: from,
      }
    }

    const txHash = result.result as Hex

    return {
      success: true,
      payer: from,
      transaction: txHash,
      network: NETWORK,
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
