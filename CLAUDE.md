# Project: mainnet-x402-facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet (eip155:1).

## What This Is

A serverless API (Hono on Vercel) that implements the x402 facilitator interface:
- `POST /verify` — verify EIP-3009 `transferWithAuthorization` signatures
- `POST /settle` — verify + execute the transfer on-chain via relay wallet
- `GET /supported` — declare supported schemes/networks

No custom smart contract. Calls USDC's native `transferWithAuthorization` directly.

## Tech Stack

- **API**: Hono + viem, deployed to Vercel as serverless function
- **Chain interaction**: viem `publicClient` for reads, `walletClient` for settlement txs
- **Tests**: Foundry fork tests against mainnet USDC (EIP-3009)
- **Protocol**: x402 v2, scheme "exact", network "eip155:1"

## Key Files

| File | Purpose |
|------|---------|
| `api/src/index.ts` | Hono route definitions |
| `api/src/verify.ts` | EIP-712 sig verification, balance/nonce/time checks |
| `api/src/settle.ts` | On-chain settlement, signature splitting |
| `api/src/types.ts` | x402 protocol types (PaymentPayload, PaymentRequirements) |
| `api/src/config.ts` | Env vars, USDC address, network constants |
| `api/src/abi.ts` | USDC ABI (transferWithAuthorization, balanceOf, authorizationState) |
| `api/api/index.ts` | Vercel serverless entry point |
| `contracts/test/TransferWithAuth.t.sol` | Fork tests for EIP-3009 on mainnet USDC |

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

- `RELAY_PRIVATE_KEY` — hot wallet private key (pays gas for settlements)
- `RPC_URL` — Ethereum mainnet RPC

## Important Details

- USDC address: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- USDC EIP-712 domain: name="USD Coin", version="2", chainId=1
- EIP-3009 uses `bytes32` nonces (not sequential), preventing replay without state reads
- The relay wallet only needs ETH — it has no special on-chain permissions
- `transferWithAuthorization` is permissionless: any address can submit a valid signature
