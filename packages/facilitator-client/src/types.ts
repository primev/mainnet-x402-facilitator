export interface Authorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

export interface PaymentPayload {
  x402Version: number
  scheme: string
  network: string
  payload: {
    signature: string
    authorization: Authorization
  }
}

export interface PaymentRequirements {
  scheme: string
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra?: {
    name?: string
    version?: string
  }
}

export interface VerifyRequest {
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
}

export interface VerifyResponse {
  isValid: boolean
  invalidReason?: string
  payer?: string
}

export interface SettleResponse {
  success: boolean
  payer?: string
  transaction?: string
  network?: string
  error?: string
  facilitator?: {
    agentId: number
    reputation: string
  }
}

export interface SupportedResponse {
  kinds: Array<{
    x402Version: number
    scheme: string
    network: string
  }>
  extensions: string[]
  signers: Record<string, string[]>
}

export interface HealthResponse {
  status: string
}

export interface DiscoveryResourcesResponse {
  resources: unknown[]
  total: number
  limit: number
  offset: number
}
