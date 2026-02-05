import { type Hex, type Address } from 'viem'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export const RELAY_PRIVATE_KEY = () => requireEnv('RELAY_PRIVATE_KEY') as Hex
export const RPC_URL = () => requireEnv('RPC_URL')

export const USDC_ADDRESS: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const CHAIN_ID = 1
export const NETWORK = 'eip155:1'

// FastRPC for preconfirmations (sub-200ms settlement)
export const FASTRPC_URL = 'https://fastrpc.mev-commit.xyz'
