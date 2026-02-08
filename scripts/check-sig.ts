import { createWalletClient, http, recoverTypedDataAddress, hashTypedData, recoverAddress, keccak256, toHex, encodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
console.log('Expected signer:', account.address)

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

console.log('\nMessage:')
console.log('  from:', message.from)
console.log('  to:', message.to)
console.log('  value:', message.value.toString())
console.log('  validAfter:', message.validAfter.toString())
console.log('  validBefore:', message.validBefore.toString())
console.log('  nonce:', nonce)

const signature = await walletClient.signTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})

console.log('\nSignature:', signature)

// Recover signer using viem
const recoveredSigner = await recoverTypedDataAddress({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
  signature,
})

console.log('\nRecovered signer (viem):', recoveredSigner)
console.log('Match:', recoveredSigner.toLowerCase() === account.address.toLowerCase())

// Now let's compute the hash the same way USDC does it
// USDC uses: keccak256(abi.encode(TYPEHASH, from, to, value, validAfter, validBefore, nonce))
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
)
console.log('\nTRANSFER_WITH_AUTHORIZATION_TYPEHASH:', TRANSFER_WITH_AUTHORIZATION_TYPEHASH)

const structHash = keccak256(
  encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
      message.from as `0x${string}`,
      message.to,
      message.value,
      message.validAfter,
      message.validBefore,
      nonce,
    ]
  )
)
console.log('Struct hash:', structHash)

// Domain separator
const DOMAIN_SEPARATOR = '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335'

// Final digest = keccak256("\x19\x01" || DOMAIN_SEPARATOR || structHash)
const digest = keccak256(
  `0x1901${DOMAIN_SEPARATOR.slice(2)}${structHash.slice(2)}` as `0x${string}`
)
console.log('Digest (USDC style):', digest)

// Compare with viem's hash
const viemHash = hashTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})
console.log('Viem typed data hash:', viemHash)
console.log('Hashes match:', digest === viemHash)

// Recover from digest
const sig = signature.slice(2)
const r = `0x${sig.slice(0, 64)}` as `0x${string}`
const s = `0x${sig.slice(64, 128)}` as `0x${string}`
const v = parseInt(sig.slice(128, 130), 16)
console.log('\nv:', v, 'r:', r, 's:', s)

const recoveredFromDigest = await recoverAddress({
  hash: digest,
  signature: { r, s, v: BigInt(v), yParity: v === 27 ? 0 : 1 },
})
console.log('Recovered from digest:', recoveredFromDigest)
