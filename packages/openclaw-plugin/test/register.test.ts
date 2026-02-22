import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from '../src/index.js'

test('register() spawns subprocess, registers provider, and wires cleanup', () => {
  const spawnCalls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = []
  const registeredProviders: unknown[] = []
  const shutdownHandlers: Array<() => void> = []

  let killed = false

  const result = register(
    {
      registerProvider: (provider) => {
        registeredProviders.push(provider)
      },
      onShutdown: (handler) => {
        shutdownHandlers.push(handler)
      },
      logger: {},
    },
    {
      nodeCommand: '/usr/local/bin/node',
      attachProcessHandlers: false,
      spawnProcess: (command, args, options) => {
        spawnCalls.push({ command, args, env: options.env })
        return {
          get killed() {
            return killed
          },
          kill: () => {
            killed = true
            return true
          },
        }
      },
    }
  )

  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0]?.command, '/usr/local/bin/node')
  assert.equal(Array.isArray(spawnCalls[0]?.args), true)
  assert.equal(spawnCalls[0]?.env.FACILITATOR_BASE_URL !== undefined, true)

  assert.equal(registeredProviders.length, 1)
  assert.equal(shutdownHandlers.length, 1)

  shutdownHandlers[0]?.()
  assert.equal(killed, true)

  assert.equal(result.provider.id, 'primev-facilitator-mcp')
})
