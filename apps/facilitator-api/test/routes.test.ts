import assert from 'node:assert/strict'
import test from 'node:test'
import { app } from '../index.js'

test('GET /health returns healthy status', async () => {
  const response = await app.request('/health')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'healthy' })
})

test('GET /supported returns supported metadata when relay key is set', async () => {
  process.env.RELAY_PRIVATE_KEY = '0x' + '11'.repeat(32)

  const response = await app.request('/supported')
  assert.equal(response.status, 200)

  const body = await response.json() as {
    kinds: Array<{ x402Version: number; scheme: string; network: string }>
    extensions: string[]
    signers: Record<string, string[]>
  }

  assert.equal(body.kinds[0]?.network, 'eip155:1')
  assert.deepEqual(body.extensions, ['bazaar'])
  assert.equal(Array.isArray(body.signers['eip155:*']), true)
})

test('POST /verify rejects missing payload/requirements', async () => {
  const response = await app.request('/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    isValid: false,
    invalidReason: 'missing_payload_or_requirements',
  })
})

test('POST /settle rejects missing payload/requirements', async () => {
  const response = await app.request('/settle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'missing_payload_or_requirements',
  })
})
