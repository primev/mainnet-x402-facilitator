import { createWalletClient, http, createPublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const FACILITATOR_URL = 'https://facilitator.primev.xyz'

// ⚠️ CONFIGURE THESE:
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`
const RECIPIENT = process.env.RECIPIENT as `0x${string}` // merchant/payTo address
const AMOUNT = process.env.AMOUNT || '10000' // 0.01 USDC (6 decimals)

if (!AGENT_PRIVATE_KEY) {
  console.error('Set AGENT_PRIVATE_KEY env var')
  process.exit(1)
}
if (!RECIPIENT) {
  console.error('Set RECIPIENT env var')
  process.exit(1)
}

async function main() {
  const account = privateKeyToAccount(AGENT_PRIVATE_KEY)

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http('https://ethereum-rpc.publicnode.com'),
  })

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http('https://ethereum-rpc.publicnode.com'),
  })

  console.log('Agent address:', account.address)
  console.log('Recipient:', RECIPIENT)
  console.log('Amount:', AMOUNT, '(', Number(AMOUNT) / 1e6, 'USDC )')

  // Check USDC balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log('USDC Balance:', Number(balance) / 1e6, 'USDC')

  if (balance < BigInt(AMOUNT)) {
    console.error('Insufficient USDC balance')
    process.exit(1)
  }

  // Generate random nonce
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`

  // Time window: valid now, expires in 15 minutes
  const validAfter = 0n
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)

  console.log('\nSigning EIP-3009 authorization...')

  // Sign EIP-712 typed data for transferWithAuthorization
  const signature = await walletClient.signTypedData({
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: 1,
      verifyingContract: USDC_ADDRESS,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: RECIPIENT,
      value: BigInt(AMOUNT),
      validAfter,
      validBefore,
      nonce,
    },
  })

  console.log('Signature:', signature.slice(0, 20) + '...')

  // Build request payload
  const payload = {
    paymentPayload: {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:1',
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: RECIPIENT,
          value: AMOUNT,
          validAfter: '0',
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    },
    paymentRequirements: {
      scheme: 'exact',
      network: 'eip155:1',
      amount: AMOUNT,
      asset: USDC_ADDRESS,
      payTo: RECIPIENT,
      maxTimeoutSeconds: 60,
    },
  }

  console.log('\nCalling /settle...')
  const startTime = Date.now()

  const response = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const result = await response.json()
  const elapsed = Date.now() - startTime

  console.log('\nResult:', JSON.stringify(result, null, 2))
  console.log(`Time: ${elapsed}ms`)

  if (result.success) {
    console.log(`\n✅ Success! View tx: https://etherscan.io/tx/${result.transaction}`)
  } else {
    console.log(`\n❌ Failed: ${result.error}`)
  }
}

main().catch(console.error)
