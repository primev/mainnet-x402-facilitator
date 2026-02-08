import { ethers } from 'ethers'
import { randomBytes } from 'crypto'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as string

const provider = new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com')
const wallet = new ethers.Wallet(AGENT_KEY, provider)

console.log('Agent:', wallet.address)

const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 1,
  verifyingContract: USDC,
}

const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

const nonce = '0x' + randomBytes(32).toString('hex')
const validBefore = Math.floor(Date.now() / 1000) + 900

const message = {
  from: wallet.address,
  to: RECIPIENT,
  value: 1000000n,
  validAfter: 0n,
  validBefore: BigInt(validBefore),
  nonce,
}

console.log('\nMessage:')
console.log('  from:', message.from)
console.log('  to:', message.to)
console.log('  value:', message.value.toString())
console.log('  validBefore:', message.validBefore.toString())
console.log('  nonce:', nonce)

console.log('\nSigning with ethers...')
const signature = await wallet.signTypedData(domain, types, message)
console.log('Signature:', signature)

// Parse signature
const sig = ethers.Signature.from(signature)
console.log('v:', sig.v)
console.log('r:', sig.r)
console.log('s:', sig.s)

// Verify locally
const recovered = ethers.verifyTypedData(domain, types, message, signature)
console.log('\nRecovered:', recovered)
console.log('Match:', recovered.toLowerCase() === wallet.address.toLowerCase())

// Try to send
const abi = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)'
]
const usdc = new ethers.Contract(USDC, abi, wallet)

console.log('\nSubmitting transaction...')
try {
  const tx = await usdc.transferWithAuthorization(
    message.from,
    message.to,
    message.value,
    message.validAfter,
    message.validBefore,
    nonce,
    sig.v,
    sig.r,
    sig.s
  )
  console.log('Tx hash:', tx.hash)
  const receipt = await tx.wait()
  console.log('Status:', receipt.status)
  console.log(`\n✅ Success! https://etherscan.io/tx/${tx.hash}`)
} catch (e: any) {
  console.log('❌ Error:', e.message?.slice(0, 300))
}
