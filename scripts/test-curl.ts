import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const FACILITATOR_URL = 'https://facilitator.primev.xyz'

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`
const RECIPIENT = '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D'
const AMOUNT = '1000000'

const account = privateKeyToAccount(AGENT_PRIVATE_KEY)

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
})

console.log('Agent:', account.address)

const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)

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
    validAfter: 0n,
    validBefore,
    nonce,
  },
})

console.log('Signature:', signature.slice(0, 20) + '...')

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
const response = await fetch(`${FACILITATOR_URL}/settle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

console.log('Status:', response.status)
console.log('Status Text:', response.statusText)
const text = await response.text()
console.log('Response:', text.slice(0, 500))
