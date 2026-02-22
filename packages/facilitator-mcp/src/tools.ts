import {
  createFacilitatorClient,
  type DiscoveryResourcesResponse,
  type HealthResponse,
  type SettleResponse,
  type SupportedResponse,
  type VerifyRequest,
  type VerifyResponse,
} from '@primev/facilitator-client'

export type PrimevToolName =
  | 'primev_health'
  | 'primev_supported'
  | 'primev_discovery_resources'
  | 'primev_verify_payment'
  | 'primev_settle_payment'

export interface PrimevClientLike {
  health: () => Promise<HealthResponse>
  supported: () => Promise<SupportedResponse>
  discoveryResources: (limit?: number, offset?: number) => Promise<DiscoveryResourcesResponse>
  verifyPayment: (request: VerifyRequest) => Promise<VerifyResponse>
  settlePayment: (request: VerifyRequest) => Promise<SettleResponse>
}

interface PrimevToolDefinition {
  name: PrimevToolName
  description: string
  inputSchema: Record<string, unknown>
}

interface PrimevToolExecutionOptions {
  name: PrimevToolName
  args: Record<string, unknown>
  client: PrimevClientLike
  settleEnabled: boolean
}

export interface PrimevRuntimeOptions {
  baseUrl: string
  timeoutMs: number
  settleEnabled: boolean
}

export function createRuntimeOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): PrimevRuntimeOptions {
  const timeoutCandidate = Number(env.FACILITATOR_TIMEOUT_MS ?? 10_000)
  const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
    ? timeoutCandidate
    : 10_000

  return {
    baseUrl: env.FACILITATOR_BASE_URL ?? 'https://facilitator.primev.xyz',
    timeoutMs,
    settleEnabled: env.PRIMEV_ENABLE_SETTLE !== 'false',
  }
}

export function createDefaultClient(options: PrimevRuntimeOptions = createRuntimeOptionsFromEnv()): PrimevClientLike {
  return createFacilitatorClient({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
  })
}

export function getToolDefinitions(): PrimevToolDefinition[] {
  return [
    {
      name: 'primev_health',
      description: 'Read facilitator health status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'primev_supported',
      description: 'Read supported x402 networks/schemes and signer metadata.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'primev_discovery_resources',
      description: 'Read facilitator bazaar discovery resources with pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 1000 },
          offset: { type: 'number', minimum: 0 },
        },
      },
    },
    {
      name: 'primev_verify_payment',
      description: 'Verify x402 EIP-3009 payment payload and requirements without submitting a transaction.',
      inputSchema: {
        type: 'object',
        required: ['paymentPayload', 'paymentRequirements'],
        properties: {
          paymentPayload: { type: 'object' },
          paymentRequirements: { type: 'object' },
        },
      },
    },
    {
      name: 'primev_settle_payment',
      description: 'Settle x402 payment through facilitator. Requires explicit confirm=true and a reason string.',
      inputSchema: {
        type: 'object',
        required: ['paymentPayload', 'paymentRequirements', 'confirm', 'reason'],
        properties: {
          paymentPayload: { type: 'object' },
          paymentRequirements: { type: 'object' },
          confirm: { type: 'boolean' },
          reason: { type: 'string', minLength: 1 },
        },
      },
    },
  ]
}

export async function runPrimevTool(options: PrimevToolExecutionOptions): Promise<unknown> {
  const { name, args, client, settleEnabled } = options

  switch (name) {
    case 'primev_health':
      return await client.health()

    case 'primev_supported':
      return await client.supported()

    case 'primev_discovery_resources': {
      const limit = asOptionalNumber(args.limit)
      const offset = asOptionalNumber(args.offset)
      return await client.discoveryResources(limit, offset)
    }

    case 'primev_verify_payment': {
      const request = parseVerifyRequest(args)
      return await client.verifyPayment(request)
    }

    case 'primev_settle_payment': {
      if (!settleEnabled) {
        throw new Error('Settlement tool is disabled by PRIMEV_ENABLE_SETTLE=false.')
      }

      const confirm = args.confirm === true
      const reason = asString(args.reason)
      if (!confirm || !reason.trim()) {
        throw new Error(
          'Settlement requires confirm=true and a non-empty reason. Example: { "confirm": true, "reason": "User requested payment settlement" }'
        )
      }

      const request = parseVerifyRequest(args)
      return await client.settlePayment(request)
    }

    default: {
      const unreachable: never = name
      throw new Error(`Unsupported tool: ${String(unreachable)}`)
    }
  }
}

function parseVerifyRequest(args: Record<string, unknown>): VerifyRequest {
  const paymentPayload = args.paymentPayload
  const paymentRequirements = args.paymentRequirements

  if (!isObject(paymentPayload) || !isObject(paymentRequirements)) {
    throw new Error('Both paymentPayload and paymentRequirements must be provided as objects.')
  }

  return {
    paymentPayload: paymentPayload as VerifyRequest['paymentPayload'],
    paymentRequirements: paymentRequirements as VerifyRequest['paymentRequirements'],
  }
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
