# Project: mainnet-x402-facilitator

x402-compliant payment facilitator for USDC on Ethereum mainnet (eip155:1) with FastRPC preconfirmations.

## What This Is

A serverless API (Hono on Vercel) that lets AI agents pay for resources instantly:
- `POST /verify` — verify EIP-3009 `transferWithAuthorization` signatures
- `POST /settle` — verify + execute via FastRPC preconfirmation (~100-200ms)
- `GET /supported` — declare supported schemes/networks + bazaar extension
- `GET /discovery/resources` — bazaar resource catalog endpoint
- `GET /agent.json` — ERC-8004 agent metadata (on-chain URI target)

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
| `apps/facilitator-api/index.ts` | Hono routes + Vercel handler |
| `apps/facilitator-api/verify.ts` | EIP-712 sig verification, balance/nonce/time checks |
| `apps/facilitator-api/settle.ts` | FastRPC settlement with `maxPriorityFeePerGas: 0` |
| `apps/facilitator-api/types.ts` | x402 protocol types (PaymentPayload, PaymentRequirements) |
| `apps/facilitator-api/config.ts` | Env vars, USDC address, FastRPC URL |
| `apps/facilitator-api/abi.ts` | USDC ABI (transferWithAuthorization, balanceOf, authorizationState) |
| `packages/facilitator-client/src/index.ts` | Typed HTTP client for facilitator endpoints |
| `packages/facilitator-mcp/src/index.ts` | MCP server entrypoint over stdio |
| `packages/openclaw-plugin/src/index.ts` | OpenClaw plugin wrapper that spawns MCP server |
| `scripts/register-erc8004.ts` | Script to register on ERC-8004 Identity Registry |
| `scripts/update-metadata.ts` | Script to update ERC-8004 metadata for Agent #23175 |
| `agent-metadata.json` | Static copy of agent metadata |
| `contracts/test/TransferWithAuth.t.sol` | Fork tests for EIP-3009 |

## Commands

```bash
# Install dependencies
pnpm install

# Build/typecheck/test workspace
pnpm build
pnpm typecheck
pnpm test

# Fork tests
cd contracts && MAINNET_RPC_URL=https://... forge test -vvv

# Type check API
cd apps/facilitator-api && npx tsc --noEmit

# Local dev
cd apps/facilitator-api && vercel dev

# Deploy
cd apps/facilitator-api && vercel --prod

# Register on ERC-8004 (already done — Agent #23175)
RELAY_PRIVATE_KEY=0x... RPC_URL=https://... npx tsx scripts/register-erc8004.ts

# Update ERC-8004 metadata (edit METADATA values in script first)
RELAY_PRIVATE_KEY=0x... RPC_URL=https://... npx tsx scripts/update-metadata.ts
# Or update specific keys only:
RELAY_PRIVATE_KEY=0x... RPC_URL=https://... npx tsx scripts/update-metadata.ts settlement_count avg_latency_ms
```

## MCP Tools

- `primev_health()`
- `primev_supported()`
- `primev_discovery_resources({ limit?, offset? })`
- `primev_verify_payment({ paymentPayload, paymentRequirements })`
- `primev_settle_payment({ paymentPayload, paymentRequirements, confirm, reason })`

`primev_settle_payment` enforces `confirm: true` and non-empty `reason`.

## Env Vars (Vercel)

- `RELAY_PRIVATE_KEY` — hot wallet private key (needs mev-commit gas tank funded)
- `RPC_URL` — Ethereum mainnet RPC for reads
- `FACILITATOR_BASE_URL` — MCP/plugin facilitator target URL (default `https://facilitator.primev.xyz`)
- `FACILITATOR_TIMEOUT_MS` — MCP/plugin HTTP timeout in milliseconds (default `10000`)
- `PRIMEV_ENABLE_SETTLE` — enables settlement MCP tool (`true` by default)

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
- Relay wallet: `0x488d87a9A88a6A878B3E7cf0bEece8984af9518D`

## Registry Status

| Registry | Status | Reference |
|----------|--------|-----------|
| **ERC-8004 Identity** | Registered — Agent #23175 | [Etherscan NFT](https://etherscan.io/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/23175), [Tx](https://etherscan.io/tx/0xcfb8619663c3da8337aea5b9868bc7067ec4db2c26132141dce83819caa05415) |
| **x402 Ecosystem** (coinbase/x402) | PR open — URL updated to facilitator.primev.xyz | [PR #1114](https://github.com/coinbase/x402/pull/1114) |
| **x402scan Explorer** (Merit-Systems/x402scan) | PR open — URL updated, VADE review issues already addressed | [PR #624](https://github.com/Merit-Systems/x402scan/pull/624) |
| **awesome-x402** (xpaysh) | PR open — URL updated | [PR #11](https://github.com/xpaysh/awesome-x402/pull/11) |
| **awesome-x402** (Merit-Systems) | PR open — URL updated | [PR #29](https://github.com/Merit-Systems/awesome-x402/pull/29) |
| **awesome-erc8004** (sudeepb02) | PR open — no URL change needed | [PR #3](https://github.com/sudeepb02/awesome-erc8004/pull/3) |
| **x402 Bazaar** | Enabled | `/supported` declares bazaar, `/discovery/resources` live |
| **x402.watch Directory** | Blocked — Ethereum mainnet not supported yet | Contact: [t.me/x402watch](https://t.me/x402watch) or [x.com/bitfalls](https://x.com/bitfalls) to request Ethereum network addition |

## Next Steps

### TODO — ERC-8004 Metadata Update
- [ ] Run `update-metadata.ts` to write reputation fields to Agent #23175 on-chain (edit METADATA values with current settlement stats first, then run — costs ~6 mainnet txs)
- [ ] Verify fields display on 8004agents.ai after on-chain update

### Short-term
- Monitor x402 ecosystem PR #1114 and x402scan PR #624 for reviewer feedback
- Fund relay wallet gas tank if ETH runs low (~0.01 ETH remaining)
- **x402.watch listing** — reach out via [t.me/x402watch](https://t.me/x402watch) or [x.com/bitfalls](https://x.com/bitfalls) to request Ethereum mainnet as a supported network; once added, submit facilitator as "Primev – Ethereum Mainnet with Preconfs" with URL `https://facilitator.primev.xyz`, relay address `0x488d87a9A88a6A878B3E7cf0bEece8984af9518D`, 0% fee, public access, Bazaar enabled

### Medium-term — Visibility & Trust
- **ERC-8004 Reputation Registry** — solicit feedback signals from early users/agents to build on-chain reputation for Agent #23175
- **ERC-8004 Validation Registry** — request validation from a third-party validator (e.g., TEE oracle or manual audit) to get a verified badge
- **Bazaar catalog persistence** — add a database (Supabase or KV store) to persist discovered resources in `/discovery/resources` as resource servers transact through the facilitator

### Growth — Expand Reach
- **Multi-chain** — extend the facilitator to Base (largest x402 market by volume) using the same FastRPC preconfirmation pattern, instantly multiplying the addressable agent pool
- **Integration guides** — publish a "Pay with Primev" quickstart showing how agents/resource servers wire up the facilitator (SDK snippet, curl examples)
- **Agent SDK compatibility** — ensure the facilitator works out-of-the-box with popular agent frameworks (Agent0 SDK, Daydreams, x402 client libraries)

### Longer-term — Differentiation
- **Preconfirmation proofs** — attach mev-commit preconfirmation receipts to x402 settle responses, giving agents cryptographic proof of settlement before block finality
- **Gas sponsorship dashboard** — expose relay wallet gas tank status and settlement metrics via a public dashboard
- **Batch settlement** — aggregate multiple agent payments into a single transaction for even lower overhead
