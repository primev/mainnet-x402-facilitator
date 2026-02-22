/**
 * Update ERC-8004 metadata for Agent #23175 on the Identity Registry.
 *
 * Adds reputation-relevant fields (settlement stats, latency, uptime)
 * that 8004agents.ai and other explorers can read and display.
 *
 * Usage:
 *   RELAY_PRIVATE_KEY=0x... RPC_URL=https://... npx tsx scripts/update-metadata.ts
 *
 * Pass specific keys to update only those:
 *   npx tsx scripts/update-metadata.ts settlement_count avg_latency_ms
 *
 * Or run with no args to update all fields.
 */

import { createPublicClient, createWalletClient, http, toHex, parseAbi, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const AGENT_ID = 23175n;

const IDENTITY_REGISTRY_ABI = parseAbi([
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external',
  'function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)',
]);

// --- Edit these values before running ---
const METADATA: Record<string, string> = {
  settlement_count: '5',
  settlement_volume_usdc: '7.50',
  avg_latency_ms: '150',
  uptime_since: '2026-02-04',
  github_repo: 'primev/mainnet-x402-facilitator',
  settlement_method: 'FastRPC preconfirmation',
};

async function main() {
  const privateKey = process.env.RELAY_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  if (!privateKey) {
    console.error('RELAY_PRIVATE_KEY is required');
    process.exit(1);
  }
  if (!rpcUrl) {
    console.error('RPC_URL is required');
    process.exit(1);
  }

  const key = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(key);

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(rpcUrl),
  });

  console.log('Updating ERC-8004 metadata for Agent #' + AGENT_ID.toString());
  console.log('  Registry:', IDENTITY_REGISTRY);
  console.log('  Account:', account.address);

  // Filter to specific keys if provided as CLI args
  const args = process.argv.slice(2);
  const keysToUpdate = args.length > 0
    ? Object.fromEntries(Object.entries(METADATA).filter(([k]) => args.includes(k)))
    : METADATA;

  if (Object.keys(keysToUpdate).length === 0) {
    console.error('\nNo matching keys found. Available:', Object.keys(METADATA).join(', '));
    process.exit(1);
  }

  console.log('\nFields to update:');
  for (const [k, v] of Object.entries(keysToUpdate)) {
    console.log(`  ${k}: ${v}`);
  }

  // Read current values first
  console.log('\nReading current on-chain values...');
  for (const key of Object.keys(keysToUpdate)) {
    try {
      const current = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getMetadata',
        args: [AGENT_ID, key],
      });
      const decoded = Buffer.from((current as string).slice(2), 'hex').toString('utf8');
      console.log(`  ${key}: ${decoded || '(empty)'}`);
    } catch {
      console.log(`  ${key}: (not set)`);
    }
  }

  // Send one tx per key
  console.log('\nSending transactions...');
  for (const [metadataKey, metadataValue] of Object.entries(keysToUpdate)) {
    try {
      const txHash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setMetadata',
        args: [AGENT_ID, metadataKey, toHex(metadataValue)],
      });

      console.log(`  ${metadataKey} -> tx: ${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`    status: ${receipt.status}, gas: ${receipt.gasUsed.toString()}`);

      if (receipt.status !== 'success') {
        console.error(`    FAILED for ${metadataKey}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ${metadataKey} ERROR: ${message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
