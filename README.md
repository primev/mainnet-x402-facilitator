# Mainnet x402 Facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet. Enables **AI agents** to pay for resources instantly using [x402](https://github.com/coinbase/x402) with **sub-200ms preconfirmations** via [Primev FastRPC](https://docs.primev.xyz/v1.1.0/get-started/fastrpc).

## Why This Exists

AI agents need to pay for APIs, compute, and data in real-time. Traditional blockchain payments are too slow (12+ seconds for finality). This facilitator:

1. Accepts EIP-3009 `transferWithAuthorization` signatures from agents
2. Settles payments via FastRPC preconfirmations (~100-200ms)
3. Agents get instant access to paid resources without waiting for block confirmation

No gas required for agents — they just sign authorizations. Gas is sponsored by mev-commit. **Zero fees** — fully x402 compatible.

## How It Works

```
Agent                     Resource Server              Facilitator           FastRPC
  │                             │                           │                   │
  │──── GET /resource ─────────>│                           │                   │
  │<─── 402 + PaymentRequired ──│                           │                   │
  │                             │                           │                   │
  │ (signs transferWithAuthorization)                       │                   │
  │                             │                           │                   │
  │──── GET /resource ─────────>│                           │                   │
  │     + PAYMENT-SIGNATURE     │── POST /verify ──────────>│                   │
  │                             │<── { isValid: true } ─────│                   │
  │                             │                           │                   │
  │                             │ (performs work)            │                   │
  │                             │                           │                   │
  │                             │── POST /settle ──────────>│── preconfirm ────>│
  │                             │<── { success, txHash } ───│<─ ~100-200ms ─────│
  │<─── 200 + response ────────│                           │                   │
```

1. Agent requests a paid resource
2. Server returns HTTP 402 with payment requirements (price, USDC, recipient)
3. Agent signs a `transferWithAuthorization` (EIP-3009) — just a signature, no tx
4. Agent retries with signature in `PAYMENT-SIGNATURE` header
5. Server calls `/verify` to validate signature, balance, nonce
6. Server performs work, then calls `/settle`
7. Facilitator submits to FastRPC → preconfirmed in ~100-200ms
8. Agent receives response immediately

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/settle` | Verify + settle payment (~100-200ms via FastRPC) |
| `POST` | `/verify` | Verify only (dry run, no execution) |
| `GET` | `/supported` | Return supported schemes and networks |

> **Note:** `/settle` verifies internally before executing. Use `/verify` only if you need to check payment validity before doing expensive work.

### POST /verify

Validates EIP-3009 signature, checks USDC balance, verifies time window, checks nonce replay.

**Request:**

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "eip155:1",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0xAgentAddress",
        "to": "0xMerchantAddress",
        "value": "1000000",
        "validAfter": "0",
        "validBefore": "1738800000",
        "nonce": "0x..."
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:1",
    "amount": "1000000",
    "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "payTo": "0xMerchantAddress",
    "maxTimeoutSeconds": 60
  }
}
```

**Response (valid):**

```json
{ "isValid": true, "payer": "0xAgentAddress" }
```

**Response (invalid):**

```json
{ "isValid": false, "invalidReason": "insufficient_funds", "payer": "0xAgentAddress" }
```

### POST /settle

Same request body. Verifies, then submits `transferWithAuthorization` via FastRPC with preconfirmation.

**Response (success):**

```json
{
  "success": true,
  "payer": "0xAgentAddress",
  "transaction": "0xTransactionHash",
  "network": "eip155:1"
}
```

### GET /supported

```json
{
  "kinds": [{ "x402Version": 2, "scheme": "exact", "network": "eip155:1" }],
  "extensions": [],
  "signers": { "eip155:*": ["0xRelayWalletAddress"] }
}
```

## Server Integration

Any server using x402 middleware can point at this facilitator:

```typescript
import { paymentMiddleware } from "@x402/express";

app.use(paymentMiddleware({
  "GET /api/data": {
    accepts: [{
      scheme: "exact",
      network: "eip155:1",
      amount: "1000000",
      asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      payTo: "0xYourAddress",
      maxTimeoutSeconds: 60,
    }],
  },
}, { facilitatorUrl: "https://x402-facilitator-gold.vercel.app" }));
```

## Agent Usage Guide

**Production API:** `https://x402-facilitator-gold.vercel.app`

This facilitator enables AI agents to make instant USDC payments on Ethereum mainnet. Agents only need to **sign** authorizations — no ETH for gas required.

### What You Need

1. An Ethereum wallet with USDC balance
2. Ability to sign EIP-712 typed data

### Quick Start with x402 Libraries

The easiest way is using the x402 client libraries which handle the 402 flow automatically:

```typescript
import { withX402 } from "@x402/axios";

const client = withX402(axios, { walletClient });
const response = await client.get("https://api.example.com/paid-endpoint");
// Payment signed and settled automatically on 402 response
```

### Manual Integration (Direct API Calls)

For agents that need direct control over payments:

#### Step 1: Sign an EIP-3009 Authorization

```typescript
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { randomBytes } from 'crypto'

const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

// Your agent's wallet
const account = privateKeyToAccount('0x...')
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
})

// Payment details (from 402 response or known ahead of time)
const payTo = '0xMerchantAddress'
const amount = '1000000' // 1 USDC (6 decimals)

// Generate random nonce (bytes32)
const nonce = `0x${randomBytes(32).toString('hex')}`

// Time window (valid for next 15 minutes)
const validAfter = 0n
const validBefore = BigInt(Math.floor(Date.now() / 1000) + 900)

// Sign EIP-712 typed data
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
    to: payTo,
    value: BigInt(amount),
    validAfter,
    validBefore,
    nonce,
  },
})
```

#### Step 2: Settle Payment

Call `/settle` to verify and execute the payment in one call:

```typescript
const settleResponse = await fetch('https://x402-facilitator-gold.vercel.app/settle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    paymentPayload: { /* same as verify */ },
    paymentRequirements: { /* same as verify */ },
  }),
})

const result = await settleResponse.json()
// { success: true, payer: "0x...", transaction: "0x...", network: "eip155:1" }
```

### Error Codes

| `invalidReason` | Description |
|-----------------|-------------|
| `unsupported_scheme` | Only `exact` scheme is supported |
| `unsupported_network` | Only `eip155:1` (Ethereum mainnet) |
| `unsupported_asset` | Only USDC at `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| `recipient_mismatch` | `authorization.to` doesn't match `paymentRequirements.payTo` |
| `insufficient_payment` | `authorization.value` is less than required `amount` |
| `authorization_not_yet_valid` | Current time is before `validAfter` |
| `authorization_expired` | Current time is after `validBefore` |
| `invalid_signature` | EIP-712 signature verification failed |
| `insufficient_funds` | Payer doesn't have enough USDC |
| `nonce_already_used` | This nonce was already used (replay protection) |

### Key Points

- **Zero fees:** Agents pay exactly the requested amount — no extra fees
- **No gas needed:** Agents sign authorizations, gas is sponsored by mev-commit
- **Instant settlement:** FastRPC preconfirmations complete in ~100-200ms
- **x402 compatible:** Works with standard x402 client libraries
- **USDC only:** This facilitator only supports USDC on Ethereum mainnet
- **Random nonces:** Generate a new random `bytes32` nonce for each payment

## Development

### Fork Tests

```bash
cd contracts
MAINNET_RPC_URL=https://... forge test -vvv
```

### API

```bash
cd api
npm install
vercel dev
```

### Env Vars

| Variable | Description |
|----------|-------------|
| `RELAY_PRIVATE_KEY` | Hot wallet for settlement txs |
| `RPC_URL` | Ethereum mainnet RPC for reads |

## Deploy

```bash
cd api
vercel --prod
```

Set `RELAY_PRIVATE_KEY` and `RPC_URL` in Vercel environment variables.

> **Note:** Gas for FastRPC preconfirmations is sponsored by mev-commit — no gas tank funding required.

## Architecture

```
api/
├── index.ts          # Hono routes + Vercel Edge handler
├── config.ts         # Env vars, USDC address, FastRPC URL
├── types.ts          # x402 protocol types
├── abi.ts            # USDC ABI (transferWithAuthorization)
├── verify.ts         # EIP-712 signature verification
├── settle.ts         # FastRPC preconfirmation settlement
└── vercel.json

contracts/
├── test/
│   └── TransferWithAuth.t.sol   # Fork tests for EIP-3009
└── foundry.toml
```

## Links

- [x402 Protocol](https://github.com/coinbase/x402)
- [Primev FastRPC](https://docs.primev.xyz/v1.1.0/get-started/fastrpc)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [mev-commit](https://docs.primev.xyz/)
