import { type Hex, type Address } from 'viem'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export const RELAY_PRIVATE_KEY = () => requireEnv('RELAY_PRIVATE_KEY') as Hex
export const RPC_URL = () => requireEnv('RPC_URL')
export const FACILITATOR_ADDRESS = () => requireEnv('FACILITATOR_ADDRESS') as Address

export const USDC_ADDRESS: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const CHAINLINK_ETH_USD: Address = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'
export const CHAIN_ID = 1
export const ESTIMATED_GAS = 95000n
export const GAS_BUFFER = 1.1
export const PERMIT_DEADLINE_SECONDS = 900
