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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]+$/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
// Safety buffer: reject if authorization expires within 60 seconds
// to account for clock drift between server and block.timestamp
const TIME_BUFFER_SECONDS = 60n

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

  // Check network consistency between payload and requirements
  if (paymentPayload.network !== paymentRequirements.network) {
    return { isValid: false, invalidReason: 'network_mismatch' }
  }

  // Check asset
  if (paymentRequirements.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    return { isValid: false, invalidReason: 'unsupported_asset' }
  }

  // Validate input formats before casting
  if (!ADDRESS_RE.test(authorization.from)) {
    return { isValid: false, invalidReason: 'invalid_from_address' }
  }
  if (!ADDRESS_RE.test(authorization.to)) {
    return { isValid: false, invalidReason: 'invalid_to_address' }
  }
  if (!HEX_RE.test(authorization.nonce)) {
    return { isValid: false, invalidReason: 'invalid_nonce_format' }
  }

  const from = authorization.from as Address
  const to = authorization.to as Address
  const nonce = authorization.nonce as Hex

  // Check for zero address
  if (from === ZERO_ADDRESS) {
    return { isValid: false, invalidReason: 'from_is_zero_address', payer: from }
  }

  let value: bigint
  let validAfter: bigint
  let validBefore: bigint
  let requiredAmount: bigint
  try {
    value = BigInt(authorization.value)
    validAfter = BigInt(authorization.validAfter)
    validBefore = BigInt(authorization.validBefore)
    requiredAmount = BigInt(paymentRequirements.amount)
  } catch {
    return { isValid: false, invalidReason: 'invalid_numeric_field', payer: from }
  }

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

  // Check time window with safety buffer for clock drift vs block.timestamp
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < validAfter) {
    return {
      isValid: false,
      invalidReason: 'authorization_not_yet_valid',
      payer: from,
    }
  }
  if (now + TIME_BUFFER_SECONDS >= validBefore) {
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

  // Check on-chain state — parallelize independent reads
  const client = getPublicClient()

  const [balance, nonceUsed] = await Promise.all([
    client.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [from],
    }),
    client.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: 'authorizationState',
      args: [from, nonce],
    }),
  ])

  if (balance < value) {
    return {
      isValid: false,
      invalidReason: 'insufficient_funds',
      payer: from,
    }
  }

  if (nonceUsed) {
    return {
      isValid: false,
      invalidReason: 'nonce_already_used',
      payer: from,
    }
  }

  return { isValid: true, payer: from }
}
