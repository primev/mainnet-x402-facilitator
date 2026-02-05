# Mainnet x402 Facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet. Enables **AI agents** to pay for resources instantly using [x402](https://github.com/coinbase/x402) with **sub-200ms preconfirmations** via [Primev FastRPC](https://docs.primev.xyz/v1.1.0/get-started/fastrpc).

## Why This Exists

AI agents need to pay for APIs, compute, and data in real-time. Traditional blockchain payments are too slow (12+ seconds for finality). This facilitator:

1. Accepts EIP-3009 `transferWithAuthorization` signatures from agents
2. Settles payments via FastRPC preconfirmations (~100-200ms)
3. Agents get instant access to paid resources without waiting for block confirmation

No gas required for agents — they just sign authorizations. The facilitator pays gas via the mev-commit network.

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
| `POST` | `/verify` | Verify payment signature without settling |
| `POST` | `/settle` | Verify + settle via FastRPC preconfirmation |
| `GET` | `/supported` | Return supported schemes and networks |

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
}, { facilitatorUrl: "https://your-facilitator.vercel.app" }));
```

## Agent Integration

Agents using `@x402/axios` or `@x402/fetch` handle the 402 flow automatically:

```typescript
import { withX402 } from "@x402/axios";

const client = withX402(axios, { walletClient });
const response = await client.get("https://api.example.com/paid-endpoint");
// Payment handled automatically on 402
```

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
| `RELAY_PRIVATE_KEY` | Hot wallet for settlement txs (needs gas tank funded) |
| `RPC_URL` | Ethereum mainnet RPC for reads |

## Deploy

```bash
cd api
vercel --prod
```

Set `RELAY_PRIVATE_KEY` and `RPC_URL` in Vercel environment variables.

**Important:** Fund the relay wallet's [mev-commit gas tank](https://docs.primev.xyz/v1.1.0/get-started/fastrpc) for FastRPC preconfirmations.

## Architecture

```
api/
├── src/
│   ├── index.ts       # Hono routes: /verify, /settle, /supported
│   ├── config.ts      # Env vars, USDC address, FastRPC URL
│   ├── types.ts       # x402 protocol types
│   ├── abi.ts         # USDC ABI (transferWithAuthorization)
│   ├── verify.ts      # EIP-712 signature verification
│   └── settle.ts      # FastRPC preconfirmation settlement
├── api/
│   └── index.ts       # Vercel serverless entry point
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
