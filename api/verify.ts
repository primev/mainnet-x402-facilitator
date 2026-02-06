import {
  createPublicClient,
  http,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem'
import { mainnet } from 'viem/chains'
import { usdcAbi } from './abi.js'
import { USDC_ADDRESS, CHAIN_ID, NETWORK, RPC_URL } from './config.js'
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from './types.js'

function getPublicClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL()),
  })
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

function getUSDCDomain() {
  return {
    name: 'USD Coin',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: USDC_ADDRESS,
  } as const
}

export async function verifyPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<VerifyResponse> {
  const { payload } = paymentPayload
  const { authorization, signature } = payload

  // Check scheme and network
  if (paymentPayload.scheme !== 'exact') {
    return { isValid: false, invalidReason: 'unsupported_scheme' }
  }
  if (paymentPayload.network !== NETWORK) {
    return { isValid: false, invalidReason: 'unsupported_network' }
  }

  // Check asset
  if (paymentRequirements.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    return { isValid: false, invalidReason: 'unsupported_asset' }
  }

  const from = authorization.from as Address
  const to = authorization.to as Address
  const value = BigInt(authorization.value)
  const validAfter = BigInt(authorization.validAfter)
  const validBefore = BigInt(authorization.validBefore)
  const nonce = authorization.nonce as Hex
  const requiredAmount = BigInt(paymentRequirements.amount)

  // Check authorization.to matches paymentRequirements.payTo
  if (to.toLowerCase() !== paymentRequirements.payTo.toLowerCase()) {
    return {
      isValid: false,
      invalidReason: 'recipient_mismatch',
      payer: from,
    }
  }

  // Check value >= required amount
  if (value < requiredAmount) {
    return {
      isValid: false,
      invalidReason: 'insufficient_payment',
      payer: from,
    }
  }

  // Check time window
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < validAfter) {
    return {
      isValid: false,
      invalidReason: 'authorization_not_yet_valid',
      payer: from,
    }
  }
  if (now >= validBefore) {
    return {
      isValid: false,
      invalidReason: 'authorization_expired',
      payer: from,
    }
  }

  // Verify EIP-712 signature
  try {
    const valid = await verifyTypedData({
      address: from,
      domain: getUSDCDomain(),
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      },
      signature: signature as Hex,
    })

    if (!valid) {
      return {
        isValid: false,
        invalidReason: 'invalid_signature',
        payer: from,
      }
    }
  } catch {
    return {
      isValid: false,
      invalidReason: 'invalid_signature',
      payer: from,
    }
  }

  // Check on-chain state
  const client = getPublicClient()

  // Check balance
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [from],
  })

  if (balance < value) {
    return {
      isValid: false,
      invalidReason: 'insufficient_funds',
      payer: from,
    }
  }

  // Check nonce hasn't been used
  const nonceUsed = await client.readContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: 'authorizationState',
    args: [from, nonce],
  })

  if (nonceUsed) {
    return {
      isValid: false,
      invalidReason: 'nonce_already_used',
      payer: from,
    }
  }

  return { isValid: true, payer: from }
}
