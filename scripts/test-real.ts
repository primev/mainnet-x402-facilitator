import { createWalletClient, createPublicClient, http, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
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

// Agent signs and also submits (transferWithAuthorization is permissionless)
const agentWallet = createWalletClient({
  account: agentAccount,
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
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
  from: agentAccount.address,
  to: RECIPIENT as `0x${string}`,
  value: 1000000n, // 1 USDC
  validAfter: 0n,
  validBefore,
  nonce,
}

console.log('\nSigning authorization for 1 USDC...')
const signature = await agentWallet.signTypedData({
  domain,
  types,
  primaryType: 'TransferWithAuthorization',
  message,
})

const sig = signature.slice(2)
const r = `0x${sig.slice(0, 64)}` as `0x${string}`
const s = `0x${sig.slice(64, 128)}` as `0x${string}`
const v = parseInt(sig.slice(128, 130), 16)

console.log('Signature v:', v)

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

console.log('\nSubmitting transaction (agent pays gas)...')
const startTime = Date.now()

try {
  const hash = await agentWallet.writeContract({
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
  })

  console.log('Tx hash:', hash)
  console.log('Waiting for confirmation...')

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  console.log('Block:', receipt.blockNumber)
  console.log(`Time: ${Date.now() - startTime}ms`)
  console.log(`\n✅ Success! https://etherscan.io/tx/${hash}`)
} catch (e: any) {
  console.log('❌ Error:', e.message?.slice(0, 500))
}
