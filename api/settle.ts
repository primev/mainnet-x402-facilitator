import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type TransactionReceipt,
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

// Call eth_sendRawTransactionSync for synchronous preconfirmation + receipt
async function sendRawTransactionSync(signedTx: Hex): Promise<TransactionReceipt> {
  const response = await fetch(FASTRPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendRawTransactionSync',
      params: [signedTx],
    }),
  })

  const result = await response.json()

  if (result.error) {
    // Error code 4 = timeout but tx in mempool
    if (result.error.code === 4 && result.error.data) {
      throw new Error(`Transaction timeout, hash: ${result.error.data}`)
    }
    throw new Error(result.error.message || 'Transaction failed')
  }

  return result.result as TransactionReceipt
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
    const [gasPrice, relayNonce] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getTransactionCount({ address: account.address }),
    ])

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

    // Submit via eth_sendRawTransactionSync - returns receipt synchronously
    const receipt = await sendRawTransactionSync(signedTx)

    // Handle both raw RPC format (0x1/0x0) and viem format (success/reverted)
    const status = String(receipt.status)
    const isSuccess = status === 'success' || status === '0x1'
    const txHash = receipt.transactionHash

    if (!isSuccess) {
      return {
        success: false,
        error: 'transaction_reverted',
        payer: from,
        transaction: txHash,
        network: NETWORK,
      }
    }

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
