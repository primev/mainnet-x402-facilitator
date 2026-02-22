import type {
  DiscoveryResourcesResponse,
  HealthResponse,
  SettleResponse,
  SupportedResponse,
  VerifyRequest,
  VerifyResponse,
} from './types.js'

export type FacilitatorClientErrorCode =
  | 'timeout'
  | 'http_error'
  | 'network_error'
  | 'invalid_response'

export interface FacilitatorClientOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class FacilitatorClientError extends Error {
  readonly code: FacilitatorClientErrorCode
  readonly path: string
  readonly status?: number
  readonly details?: unknown

  constructor(
    message: string,
    options: {
      code: FacilitatorClientErrorCode
      path: string
      status?: number
      details?: unknown
    }
  ) {
    super(message)
    this.name = 'FacilitatorClientError'
    this.code = options.code
    this.path = options.path
    this.status = options.status
    this.details = options.details
  }
}

const DEFAULT_BASE_URL = 'https://facilitator.primev.xyz'
const DEFAULT_TIMEOUT_MS = 10_000

export class FacilitatorClient {
  readonly baseUrl: string
  readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: FacilitatorClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? process.env.FACILITATOR_BASE_URL ?? DEFAULT_BASE_URL
    )

    const parsedTimeout = Number(
      options.timeoutMs ?? process.env.FACILITATOR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
    )

    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : DEFAULT_TIMEOUT_MS

    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health')
  }

  async supported(): Promise<SupportedResponse> {
    return this.request<SupportedResponse>('/supported')
  }

  async discoveryResources(limit = 100, offset = 0): Promise<DiscoveryResourcesResponse> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 100
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    return this.request<DiscoveryResourcesResponse>(
      `/discovery/resources?limit=${safeLimit}&offset=${safeOffset}`
    )
  }

  async verifyPayment(request: VerifyRequest): Promise<VerifyResponse> {
    return this.request<VerifyResponse>('/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
  }

  async settlePayment(request: VerifyRequest): Promise<SettleResponse> {
    return this.request<SettleResponse>('/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })

      const rawBody = await response.text()
      const parsed = parseJson(rawBody)

      if (!response.ok) {
        throw new FacilitatorClientError(
          `Facilitator request failed (${response.status}) at ${path}`,
          {
            code: 'http_error',
            path,
            status: response.status,
            details: parsed,
          }
        )
      }

      if (parsed === undefined) {
        throw new FacilitatorClientError(
          `Expected JSON response at ${path}, received empty body`,
          { code: 'invalid_response', path, details: rawBody }
        )
      }

      return parsed as T
    } catch (error) {
      if (error instanceof FacilitatorClientError) {
        throw error
      }

      if (isAbortError(error)) {
        throw new FacilitatorClientError(
          `Facilitator request timed out after ${this.timeoutMs}ms at ${path}`,
          { code: 'timeout', path }
        )
      }

      throw new FacilitatorClientError(
        `Facilitator request failed due to network error at ${path}`,
        {
          code: 'network_error',
          path,
          details: error,
        }
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createFacilitatorClient(options: FacilitatorClientOptions = {}): FacilitatorClient {
  return new FacilitatorClient(options)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function parseJson(raw: string): unknown {
  if (!raw.trim()) {
    return undefined
  }

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError'
}

export type {
  Authorization,
  DiscoveryResourcesResponse,
  HealthResponse,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyRequest,
  VerifyResponse,
} from './types.js'
