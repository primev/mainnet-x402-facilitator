import { createWalletClient, http, verifyTypedData, hashTypedData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
console.log('Signer:', account.address)

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

console.log('\nMessage:', JSON.stringify({
  ...message,
  value: message.value.toString(),
  validAfter: message.validAfter.toString(),
  validBefore: message.validBefore.toString(),
}, null, 2))

const signature = await walletClient.signTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})

console.log('\nSignature:', signature)

// Verify locally
const isValid = await verifyTypedData({
  address: account.address,
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
  signature,
})

console.log('Local verification:', isValid)

// Show hash
const hash = hashTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})
console.log('Typed data hash:', hash)

// Split signature to show v,r,s
const sig = signature.slice(2)
const r = `0x${sig.slice(0, 64)}`
const s = `0x${sig.slice(64, 128)}`
const v = parseInt(sig.slice(128, 130), 16)
console.log('\nv:', v, 'r:', r.slice(0,10) + '...', 's:', s.slice(0,10) + '...')
