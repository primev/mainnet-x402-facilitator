import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'
import { verifyPayment } from './verify.js'
import { settlePayment, getRelayAddress } from './settle.js'
import { NETWORK } from './config.js'
import type { VerifyRequest, SupportedResponse } from './types.js'

export const config = {
  runtime: 'edge',
}

export const app = new Hono()

app.use('/*', cors())

// Global error handler for malformed requests
app.onError((err, c) => {
  if (err instanceof SyntaxError) {
    return c.json({ error: 'invalid_json' }, 400)
  }
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/', (c) => {
  return c.json({ message: 'x402 facilitator api' })
})

app.post('/verify', async (c) => {
  let body: VerifyRequest
  try {
    body = (await c.req.json()) as VerifyRequest
  } catch {
    return c.json({ isValid: false, invalidReason: 'invalid_json' }, 400)
  }

  const { paymentPayload, paymentRequirements } = body

  if (!paymentPayload || !paymentRequirements) {
    return c.json(
      { isValid: false, invalidReason: 'missing_payload_or_requirements' },
      400
    )
  }

  const result = await verifyPayment(paymentPayload, paymentRequirements)
  return c.json(result)
})

app.post('/settle', async (c) => {
  let body: VerifyRequest
  try {
    body = (await c.req.json()) as VerifyRequest
  } catch {
    return c.json({ success: false, error: 'invalid_json' }, 400)
  }

  const { paymentPayload, paymentRequirements } = body

  if (!paymentPayload || !paymentRequirements) {
    return c.json({ success: false, error: 'missing_payload_or_requirements' }, 400)
  }

  const result = await settlePayment(paymentPayload, paymentRequirements)
  const status = result.success ? 200 : 400
  return c.json(result, status)
})

app.get('/supported', (c) => {
  try {
    const relayAddress = getRelayAddress()
    const response: SupportedResponse = {
      kinds: [
        { x402Version: 2, scheme: 'exact', network: NETWORK },
      ],
      extensions: ['bazaar'],
      signers: {
        'eip155:*': [relayAddress],
      },
    }
    return c.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy' })
})

app.get('/discovery/resources', (c) => {
  const rawLimit = Number(c.req.query('limit') || 100)
  const rawOffset = Number(c.req.query('offset') || 0)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 100
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return c.json({
    resources: [],
    total: 0,
    limit,
    offset,
  })
})

app.get('/agent.json', (c) => {
  try {
    const relayAddress = getRelayAddress()
    return c.json({
      name: 'Primev FastRPC Facilitator',
      description: 'Fee-free x402 payment facilitator on Ethereum mainnet. Sub-200ms USDC settlement via mev-commit FastRPC preconfirmations using EIP-3009 transferWithAuthorization.',
      version: '1.0.0',
      type: 'facilitator',
      protocol: 'x402',
      x402: {
        version: 2,
        scheme: 'exact',
        network: NETWORK,
        baseUrl: 'https://facilitator.primev.xyz',
        endpoints: {
          verify: '/verify',
          settle: '/settle',
          supported: '/supported',
          health: '/health',
        },
        assets: ['USDC'],
        fees: '0',
      },
      operator: {
        name: 'Primev',
        website: 'https://primev.xyz',
        infrastructure: 'https://mev-commit.xyz',
      },
      erc8004: {
        identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
        agentId: 23175,
        network: 'eip155:1',
      },
      relayAddress,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

export default handle(app)
