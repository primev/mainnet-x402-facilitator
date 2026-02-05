import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyPayment } from './verify'
import { settlePayment, getRelayAddress } from './settle'
import { NETWORK } from './config'
import type { VerifyRequest, SupportedResponse } from './types'

const app = new Hono()

app.use('/*', cors())

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
})

export default app
