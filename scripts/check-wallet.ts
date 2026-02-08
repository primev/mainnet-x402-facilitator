import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WALLET = '0x0D42aa898242f52c8876688605f31E87d81A3e26'

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
})

const abi = [
  { name: 'isBlacklisted', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'paused', type: 'function', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

const isBlacklisted = await client.readContract({
  address: USDC,
  abi,
  functionName: 'isBlacklisted',
  args: [WALLET],
})

const paused = await client.readContract({
  address: USDC,
  abi,
  functionName: 'paused',
})

const balance = await client.readContract({
  address: USDC,
  abi,
  functionName: 'balanceOf',
  args: [WALLET],
})

console.log('Wallet:', WALLET)
console.log('Blacklisted:', isBlacklisted)
console.log('Contract paused:', paused)
console.log('USDC Balance:', Number(balance) / 1e6, 'USDC')
