import assert from 'node:assert/strict'
import test from 'node:test'
import type { VerifyRequest } from '@primev/facilitator-client'
import { getToolDefinitions, runPrimevTool, type PrimevClientLike } from '../src/tools.js'

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

function createMockClient(): PrimevClientLike {
  return {
    health: async () => ({ status: 'healthy' }),
    supported: async () => ({ kinds: [], extensions: ['bazaar'], signers: { 'eip155:*': [] } }),
    discoveryResources: async (limit = 100, offset = 0) => ({ resources: [], total: 0, limit, offset }),
    verifyPayment: async () => ({ isValid: true }),
    settlePayment: async () => ({ success: true, transaction: '0xabc', network: 'eip155:1' }),
  }
}

test('tool definitions include the expected five tools', () => {
  const names = getToolDefinitions().map((tool) => tool.name)
  assert.deepEqual(names, [
    'primev_health',
    'primev_supported',
    'primev_discovery_resources',
    'primev_verify_payment',
    'primev_settle_payment',
  ])
})

test('health tool delegates to client.health()', async () => {
  const result = await runPrimevTool({
    name: 'primev_health',
    args: {},
    client: createMockClient(),
    settleEnabled: true,
  })

  assert.deepEqual(result, { status: 'healthy' })
})

test('settle tool rejects missing explicit confirmation', async () => {
  await assert.rejects(
    () => runPrimevTool({
      name: 'primev_settle_payment',
      args: {
        paymentPayload: verifyRequestFixture.paymentPayload,
        paymentRequirements: verifyRequestFixture.paymentRequirements,
      },
      client: createMockClient(),
      settleEnabled: true,
    }),
    /Settlement requires confirm=true/
  )
})

test('settle tool executes with explicit confirmation and reason', async () => {
  const result = await runPrimevTool({
    name: 'primev_settle_payment',
    args: {
      paymentPayload: verifyRequestFixture.paymentPayload,
      paymentRequirements: verifyRequestFixture.paymentRequirements,
      confirm: true,
      reason: 'User explicitly requested settlement',
    },
    client: createMockClient(),
    settleEnabled: true,
  })

  assert.deepEqual(result, { success: true, transaction: '0xabc', network: 'eip155:1' })
})
