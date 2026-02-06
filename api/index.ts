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

const app = new Hono()

app.use('/*', cors())

app.get('/', (c) => {
  return c.json({ message: 'x402 facilitator api' })
})

app.post('/verify', async (c) => {
  const body = (await c.req.json()) as VerifyRequest
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
  const body = (await c.req.json()) as VerifyRequest
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
      extensions: [],
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

export default handle(app)
