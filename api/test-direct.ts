import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
console.log('Agent:', account.address)

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
})

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
})

const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 1,
  verifyingContract: USDC,
} as const

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)

const message = {
  from: account.address,
  to: RECIPIENT as `0x${string}`,
  value: 1000000n,
  validAfter: 0n,
  validBefore,
  nonce,
}

console.log('Signing...')
const signature = await walletClient.signTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})

// Split signature
const sig = signature.slice(2)
const r = `0x${sig.slice(0, 64)}` as `0x${string}`
const s = `0x${sig.slice(64, 128)}` as `0x${string}`
const v = parseInt(sig.slice(128, 130), 16)

console.log('v:', v, 'r:', r.slice(0,20)+'...', 's:', s.slice(0,20)+'...')

const abi = [{
  name: 'transferWithAuthorization',
  type: 'function',
  inputs: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' },
    { name: 'r', type: 'bytes32' },
    { name: 's', type: 'bytes32' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const

console.log('\nSimulating transferWithAuthorization...')
try {
  await publicClient.simulateContract({
    address: USDC,
    abi,
    functionName: 'transferWithAuthorization',
    args: [
      message.from,
      message.to,
      message.value,
      message.validAfter,
      message.validBefore,
      nonce,
      v,
      r,
      s,
    ],
    account: account.address,
  })
  console.log('✅ Simulation passed!')
} catch (e: any) {
  console.log('❌ Simulation failed:', e.message?.slice(0, 200))
}
