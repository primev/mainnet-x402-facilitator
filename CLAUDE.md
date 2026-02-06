# Project: mainnet-x402-facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet (eip155:1) with FastRPC preconfirmations.

## What This Is

A serverless API (Hono on Vercel) that lets AI agents pay for resources instantly:
- `POST /verify` — verify EIP-3009 `transferWithAuthorization` signatures
- `POST /settle` — verify + execute via FastRPC preconfirmation (~100-200ms)
- `GET /supported` — declare supported schemes/networks

No custom smart contract. Calls USDC's native `transferWithAuthorization` directly via FastRPC.

## Tech Stack

- **API**: Hono + viem, deployed to Vercel
- **Settlement**: FastRPC (`https://fastrpc.mev-commit.xyz`) for preconfirmations
- **Reads**: Standard RPC for balance/nonce checks
- **Tests**: Foundry fork tests against mainnet USDC
- **Protocol**: x402 v2, scheme "exact", network "eip155:1"

## Key Files

| File | Purpose |
|------|---------|
| `api/index.ts` | Hono routes + Vercel handler |
| `api/verify.ts` | EIP-712 sig verification, balance/nonce/time checks |
| `api/settle.ts` | FastRPC settlement with `maxPriorityFeePerGas: 0` |
| `api/types.ts` | x402 protocol types (PaymentPayload, PaymentRequirements) |
| `api/config.ts` | Env vars, USDC address, FastRPC URL |
| `api/abi.ts` | USDC ABI (transferWithAuthorization, balanceOf, authorizationState) |
| `contracts/test/TransferWithAuth.t.sol` | Fork tests for EIP-3009 |

## Commands

```bash
# Fork tests
cd contracts && MAINNET_RPC_URL=https://... forge test -vvv

# Type check API
cd api && npx tsc --noEmit

# Local dev
cd api && vercel dev

# Deploy
cd api && vercel --prod
```

## Env Vars (Vercel)

- `RELAY_PRIVATE_KEY` — hot wallet private key (needs mev-commit gas tank funded)
- `RPC_URL` — Ethereum mainnet RPC for reads

## FastRPC Integration

Settlement uses FastRPC for preconfirmations:
- Endpoint: `https://fastrpc.mev-commit.xyz`
- Requires `maxPriorityFeePerGas: 0` (fees handled by mev-commit gas tank)
- Sub-200ms preconfirmation instead of 12+ second finality
- Relay wallet must fund gas tank at mev-commit, not just hold ETH

## Important Details

- USDC address: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- USDC EIP-712 domain: name="USD Coin", version="2", chainId=1
- EIP-3009 uses `bytes32` nonces (not sequential), client-generated
- Agents sign authorizations, never need gas themselves
- `transferWithAuthorization` is permissionless: any address can submit valid signature
