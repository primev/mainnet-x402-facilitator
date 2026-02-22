import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FacilitatorClient,
  FacilitatorClientError,
  type VerifyRequest,
} from '../src/index.js'

const verifyRequestFixture: VerifyRequest = {
  paymentPayload: {
    x402Version: 2,
    scheme: 'exact',
    network: 'eip155:1',
    payload: {
      signature: '0x1234',
      authorization: {
        from: '0x0000000000000000000000000000000000000001',
        to: '0x0000000000000000000000000000000000000002',
        value: '1',
        validAfter: '0',
        validBefore: '9999999999',
        nonce: '0xabc',
      },
    },
  },
  paymentRequirements: {
    scheme: 'exact',
    network: 'eip155:1',
    amount: '1',
    asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    payTo: '0x0000000000000000000000000000000000000002',
    maxTimeoutSeconds: 60,
  },
}

test('health() returns parsed JSON payload', async () => {
  const client = new FacilitatorClient({
    baseUrl: 'https://example.com',
    fetchImpl: async () => new Response(JSON.stringify({ status: 'healthy' }), { status: 200 }),
  })

  const result = await client.health()
  assert.deepEqual(result, { status: 'healthy' })
})

test('verifyPayment() sends POST body', async () => {
  let capturedInit: RequestInit | undefined

  const client = new FacilitatorClient({
    baseUrl: 'https://example.com',
    fetchImpl: async (_input, init) => {
      capturedInit = init
      return new Response(JSON.stringify({ isValid: true }), { status: 200 })
    },
  })

  const result = await client.verifyPayment(verifyRequestFixture)
  assert.equal(result.isValid, true)
  assert.equal(capturedInit?.method, 'POST')
  assert.equal(typeof capturedInit?.body, 'string')
})

test('http errors include structured status and body details', async () => {
  const client = new FacilitatorClient({
    baseUrl: 'https://example.com',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400 }),
  })

  await assert.rejects(
    () => client.settlePayment(verifyRequestFixture),
    (error: unknown) => {
      assert.ok(error instanceof FacilitatorClientError)
      assert.equal(error.code, 'http_error')
      assert.equal(error.status, 400)
      assert.deepEqual(error.details, { error: 'invalid_signature' })
      return true
    }
  )
})

test('timeout errors are mapped consistently', async () => {
  const client = new FacilitatorClient({
    baseUrl: 'https://example.com',
    timeoutMs: 5,
    fetchImpl: async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    },
  })

  await assert.rejects(
    () => client.health(),
    (error: unknown) => {
      assert.ok(error instanceof FacilitatorClientError)
      assert.equal(error.code, 'timeout')
      assert.equal(error.path, '/health')
      return true
    }
  )
})
