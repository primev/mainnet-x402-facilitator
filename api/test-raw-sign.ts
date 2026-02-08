import { createWalletClient, createPublicClient, http, keccak256, encodeAbiParameters, toHex, concat } from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`

const agentAccount = privateKeyToAccount(AGENT_KEY)

console.log('Agent:', agentAccount.address)

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})

const agentWallet = createWalletClient({
  account: agentAccount,
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})

// Constants
const DOMAIN_SEPARATOR = '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335' as `0x${string}`
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
)

const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)
const from = agentAccount.address
const to = RECIPIENT as `0x${string}`
const value = 1000000n
const validAfter = 0n

console.log('\nMessage:')
console.log('  from:', from)
console.log('  to:', to)
console.log('  value:', value.toString())
console.log('  validBefore:', validBefore.toString())
console.log('  nonce:', nonce)

// Compute struct hash (same as Foundry)
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
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
    ]
  )
)

console.log('\nStructHash:', structHash)

// Compute digest (same as Foundry: keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)))
const digest = keccak256(
  concat([toHex('\x19\x01'), DOMAIN_SEPARATOR, structHash])
)

console.log('Digest:', digest)

// Sign the raw digest using account's sign function
const sig = await sign({ hash: digest, privateKey: AGENT_KEY })

console.log('\nSignature v:', sig.v)
console.log('Signature r:', sig.r)
console.log('Signature s:', sig.s)

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

console.log('\nSubmitting transaction...')
const startTime = Date.now()

try {
  const hash = await agentWallet.writeContract({
    address: USDC,
    abi,
    functionName: 'transferWithAuthorization',
    args: [
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      Number(sig.v),
      sig.r,
      sig.s,
    ],
  })

  console.log('Tx hash:', hash)
  console.log('Waiting for confirmation...')

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  console.log(`Time: ${Date.now() - startTime}ms`)
  console.log(`\n✅ Success! https://etherscan.io/tx/${hash}`)
} catch (e: any) {
  console.log('❌ Error:', e.message?.slice(0, 500))
}
