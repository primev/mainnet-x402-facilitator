# Mainnet x402 Facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet. Implements the [x402 protocol](https://github.com/coinbase/x402) — verifies and settles EIP-3009 `transferWithAuthorization` signatures over HTTP.

## How x402 Works

```
Client                    Resource Server              Facilitator
  │                             │                           │
  │──── GET /resource ─────────>│                           │
  │<─── 402 + PaymentRequired ──│                           │
  │                             │                           │
  │ (signs transferWithAuthorization)                       │
  │                             │                           │
  │──── GET /resource ─────────>│                           │
  │     + PAYMENT-SIGNATURE     │── POST /verify ──────────>│
  │                             │<── { isValid: true } ─────│
  │                             │                           │
  │                             │ (performs work)            │
  │                             │                           │
  │                             │── POST /settle ──────────>│
  │                             │<── { success, txHash } ───│
  │<─── 200 + response ────────│                           │
```

1. Client requests a paid resource
2. Server returns HTTP 402 with payment requirements (price, token, recipient)
3. Client signs a `transferWithAuthorization` (EIP-3009) authorizing the exact USDC transfer
4. Client retries the request with the signature in a `PAYMENT-SIGNATURE` header
5. Server forwards to this facilitator for verification, then settlement
6. Facilitator calls `transferWithAuthorization` on USDC directly on-chain, paying gas

No custom smart contract is deployed — the facilitator calls USDC's native `transferWithAuthorization`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/verify` | Verify a payment signature without settling |
| `POST` | `/settle` | Verify and execute the payment on-chain |
| `GET` | `/supported` | Return supported schemes and networks |

### POST /verify

Validates the EIP-3009 signature, checks USDC balance, verifies time window, and checks nonce replay.

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
        "from": "0xPayerAddress",
        "to": "0xRecipientAddress",
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
    "payTo": "0xRecipientAddress",
    "maxTimeoutSeconds": 60
  }
}
```

**Response (valid):**

```json
{ "isValid": true, "payer": "0xPayerAddress" }
```

**Response (invalid):**

```json
{ "isValid": false, "invalidReason": "insufficient_funds", "payer": "0xPayerAddress" }
```

### POST /settle

Same request body as `/verify`. Verifies first, then calls `transferWithAuthorization` on USDC and waits for confirmation.

**Response (success):**

```json
{
  "success": true,
  "payer": "0xPayerAddress",
  "transaction": "0xTransactionHash",
  "network": "eip155:1"
}
```

**Response (failure):**

```json
{
  "success": false,
  "error": "insufficient_funds",
  "payer": "0xPayerAddress"
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

Any app using x402 middleware can point at this facilitator by setting `facilitatorUrl`:

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

Middleware packages exist for Express, Hono, and Next.js. Client wrappers (`@x402/axios`, `@x402/fetch`) handle the 402 flow automatically.

## Development

### Fork Tests

```bash
cd contracts
MAINNET_RPC_URL=https://... forge test -vvv
```

Validates EIP-3009 `transferWithAuthorization` against mainnet USDC on a fork (happy path, expiry, wrong signer, insufficient balance, nonce replay, anyone-can-relay).

### API

```bash
cd api
npm install
vercel dev
```

### Env Vars

| Variable | Description |
|----------|-------------|
| `RELAY_PRIVATE_KEY` | Hot wallet that submits settlement txs (needs ETH for gas) |
| `RPC_URL` | Ethereum mainnet RPC URL |
| `MAINNET_RPC_URL` | Mainnet RPC for fork testing (contracts only) |

`RELAY_PRIVATE_KEY` and `RPC_URL` are set in Vercel project settings (encrypted at rest, never in source).

## Deploy

```bash
cd api
vercel --prod
```

Set `RELAY_PRIVATE_KEY` and `RPC_URL` in Vercel environment variables. Fund the relay wallet with ETH for gas.

## Architecture

```
api/
├── src/
│   ├── index.ts       # Hono routes: /verify, /settle, /supported
│   ├── config.ts      # Env validation, USDC address, network constants
│   ├── types.ts       # x402 protocol types
│   ├── abi.ts         # USDC ABI (transferWithAuthorization, balanceOf, authorizationState)
│   ├── verify.ts      # EIP-712 signature verification, balance/nonce checks
│   └── settle.ts      # On-chain settlement via relay wallet
├── api/
│   └── index.ts       # Vercel serverless entry point
├── package.json
├── tsconfig.json
└── vercel.json

contracts/
├── test/
│   └── TransferWithAuth.t.sol   # Mainnet fork tests for EIP-3009
├── lib/
│   └── forge-std/               # Foundry test framework
└── foundry.toml
```
