import { keccak256, encodeAbiParameters, toHex, concat, recoverAddress } from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'
import { randomBytes } from 'crypto'

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`
const agentAccount = privateKeyToAccount(AGENT_KEY)

console.log('Agent:', agentAccount.address)

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D' as `0x${string}`

const DOMAIN_SEPARATOR = '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335' as `0x${string}`
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
)

const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)
const from = agentAccount.address
const to = RECIPIENT
const value = 1000000n
const validAfter = 0n

console.log('\nTypehash:', TRANSFER_WITH_AUTHORIZATION_TYPEHASH)

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

console.log('StructHash:', structHash)

const digest = keccak256(concat(['0x1901' as `0x${string}`, DOMAIN_SEPARATOR, structHash]))
console.log('Digest:', digest)

// Sign
const sig = await sign({ hash: digest, privateKey: AGENT_KEY })
console.log('\nSignature:')
console.log('  v:', Number(sig.v))
console.log('  r:', sig.r)
console.log('  s:', sig.s)

// Recover
const recovered = await recoverAddress({
  hash: digest,
  signature: {
    r: sig.r,
    s: sig.s,
    v: sig.v,
    yParity: Number(sig.v) === 27 ? 0 : 1,
  }
})

console.log('\nRecovered address:', recovered)
console.log('Expected address:', from)
console.log('Match:', recovered.toLowerCase() === from.toLowerCase())
