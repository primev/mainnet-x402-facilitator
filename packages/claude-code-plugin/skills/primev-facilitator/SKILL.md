---
name: primev-facilitator
summary: Use Primev facilitator MCP tools for x402 payment verification and settlement.
---

# Primev Facilitator Skill

## Purpose
Use the Primev facilitator MCP tools to inspect capability metadata, verify EIP-3009 payloads, and settle eligible x402 payments.

## Tool Usage Order
1. Call `primev_supported` if network/scheme compatibility is unknown.
2. Call `primev_verify_payment` before any settlement attempt.
3. Call `primev_settle_payment` only after explicit user approval.

## Settlement Rule
`primev_settle_payment` must include:
- `confirm: true`
- `reason`: short explanation tied to the user request.

If user confirmation is missing, stop at verification and ask for explicit approval.

## Notes
- `primev_health` and `primev_discovery_resources` are read-only.
- `primev_settle_payment` can move funds and should be treated as a high-risk action.
