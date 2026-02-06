import { type Hex, type Address } from 'viem'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export const RELAY_PRIVATE_KEY = (): Hex => {
  const key = requireEnv('RELAY_PRIVATE_KEY').trim()
  const normalized = key.startsWith('0x') ? key : `0x${key}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`Invalid private key format (length: ${normalized.length})`)
  }
  return normalized as Hex
}
export const RPC_URL = () => requireEnv('RPC_URL')

export const USDC_ADDRESS: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const CHAIN_ID = 1
export const NETWORK = 'eip155:1'

// FastRPC for preconfirmations (sub-200ms settlement)
export const FASTRPC_URL = 'https://fastrpc.mev-commit.xyz'
