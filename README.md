# Mainnet x402 Facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet. Implements the [x402 protocol](https://github.com/coinbase/x402) — verifies and settles EIP-3009 `transferWithAuthorization` signatures over HTTP.

## How x402 Works

1. Client requests a paid resource from a server
2. Server returns HTTP 402 with payment requirements
3. Client signs a `transferWithAuthorization` (EIP-3009)
4. Server forwards to this facilitator for verification and settlement
5. Facilitator submits the transfer on-chain, paying gas on behalf of the payer

No custom contract is needed — the facilitator calls USDC's native `transferWithAuthorization` directly.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/verify` | Verify a payment signature without settling |
| `POST` | `/settle` | Verify and execute the payment on-chain |
| `GET` | `/supported` | Return supported schemes and networks |

### POST /verify

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "eip155:1",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0x...",
        "to": "0x...",
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
    "payTo": "0x...",
    "maxTimeoutSeconds": 60
  }
}
```

### POST /settle

Same request body as `/verify`. Returns transaction hash on success.

### GET /supported

```json
{
  "kinds": [{ "x402Version": 2, "scheme": "exact", "network": "eip155:1" }],
  "extensions": [],
  "signers": { "eip155:*": ["0x...relayAddress"] }
}
```

## Server Integration

Any app using x402 middleware can point at this facilitator:

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

## Development

### Fork Tests

```bash
cd contracts
MAINNET_RPC_URL=https://... forge test -vvv
```

Validates EIP-3009 `transferWithAuthorization` on a mainnet fork.

### API

```bash
cd api
npm install
vercel dev
```

### Env Vars

| Variable | Description |
|----------|-------------|
| `RELAY_PRIVATE_KEY` | Hot wallet private key for submitting settlement transactions |
| `RPC_URL` | Ethereum mainnet RPC URL |

Set these in Vercel project settings (encrypted, never in source).

## Deploy

```bash
cd api
vercel --prod
```

Then set `RELAY_PRIVATE_KEY` and `RPC_URL` in Vercel environment variables. Fund the relay wallet with ETH for gas.
