import { keccak256, encodeAbiParameters, toHex, concat } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`
const agentAccount = privateKeyToAccount(AGENT_KEY)

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D' as `0x${string}`

const DOMAIN_SEPARATOR = '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335' as `0x${string}`
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = '0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267' as `0x${string}`

// Use fixed values for reproducibility
const nonce = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`
const validBefore = 1770422000n
const from = agentAccount.address
const to = RECIPIENT
const value = 1000000n
const validAfter = 0n

console.log('from:', from)
console.log('to:', to)
console.log('value:', value.toString())
console.log('validAfter:', validAfter.toString())
console.log('validBefore:', validBefore.toString())
console.log('nonce:', nonce)

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
      from as `0x${string}`,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
    ]
  )
)

console.log('\nstructHash:', structHash)

const digest = keccak256(concat(['0x1901' as `0x${string}`, DOMAIN_SEPARATOR, structHash]))
console.log('digest:', digest)
console.log('\nSign this with: cast wallet sign --no-hash', digest, '--private-key $KEY')
