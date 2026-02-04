# Mainnet x402 Facilitator

Gas-sponsored USDC transfers on Ethereum mainnet via ERC-20 permit signatures.

## Architecture

- **Facilitator.sol** — Accepts a USDC `permit` signature, transfers USDC from sender to recipient, and collects a gas fee in USDC
- **Hono API** — Serverless API (Vercel) that estimates gas costs via Chainlink ETH/USD, constructs permit parameters, and relays transactions

## Contracts

```bash
cd contracts
forge build
forge test  # requires MAINNET_RPC_URL env var for fork testing
```

### Deploy

```bash
forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --verify
```

## API

```bash
cd api
npm install
vercel dev    # local development
vercel --prod # production deploy
```

### Env vars

| Variable | Description |
|----------|-------------|
| `RELAY_PRIVATE_KEY` | Private key for the relay wallet that submits transactions |
| `RPC_URL` | Ethereum mainnet RPC URL |
| `FACILITATOR_ADDRESS` | Deployed Facilitator contract address |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/quote` | Get gas fee estimate and permit params |
| `POST` | `/facilitate` | Submit a signed permit for facilitation |
| `GET` | `/status/:txHash` | Check transaction status |
| `GET` | `/health` | Relay wallet and contract health |
