import {
  createPublicClient,
  createWalletClient,
  http,
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

  // Use regular RPC for now (FastRPC requires mev-commit gas tank setup)
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: http(RPC_URL()),
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

  const { publicClient, walletClient } = getClients()

  try {
    const gasPrice = await publicClient.getGasPrice()

    // Submit via FastRPC with maxPriorityFeePerGas: 0 (gas covered by mev-commit)
    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: 'transferWithAuthorization',
      args: [from, to, value, validAfter, validBefore, nonce, v, r, s],
    })

    // Return immediately - don't wait for receipt (FastRPC preconfirmation is ~100-200ms)
    // The tx hash can be used to check status if needed
    return {
      success: true,
      payer: from,
      transaction: hash,
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
