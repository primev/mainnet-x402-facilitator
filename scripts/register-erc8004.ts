/**
 * Register the Primev FastRPC facilitator on the ERC-8004 Identity Registry.
 *
 * Usage:
 *   RELAY_PRIVATE_KEY=0x... RPC_URL=https://... npx tsx register-erc8004.ts
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData, toHex, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

const AGENT_URI = 'https://facilitator.primev.xyz/agent.json';

const IDENTITY_REGISTRY_ABI = parseAbi([
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) external returns (uint256 agentId)',
  'function register(string agentURI) external returns (uint256 agentId)',
  'function register() external returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
]);

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

  const key = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(key);

  console.log('Registering on ERC-8004 Identity Registry...');
  console.log('  Registry:', IDENTITY_REGISTRY);
  console.log('  Account:', account.address);
  console.log('  Agent URI:', AGENT_URI);

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });

  // Check if already registered
  const balance = await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (balance > 0n) {
    console.log(`\nAlready registered! This address owns ${balance} agent identity NFT(s).`);
    process.exit(0);
  }

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(rpcUrl),
  });

  // Metadata entries
  const metadata = [
    {
      metadataKey: 'agentName',
      metadataValue: toHex('Primev FastRPC Facilitator'),
    },
    {
      metadataKey: 'agentType',
      metadataValue: toHex('x402-facilitator'),
    },
    {
      metadataKey: 'protocol',
      metadataValue: toHex('x402'),
    },
    {
      metadataKey: 'network',
      metadataValue: toHex('eip155:1'),
    },
    {
      metadataKey: 'operator',
      metadataValue: toHex('Primev'),
    },
  ];

  console.log('\nSending registration transaction...');

  const txHash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [AGENT_URI, metadata],
  });

  console.log('  Tx hash:', txHash);
  console.log('\nWaiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log('  Status:', receipt.status);
  console.log('  Block:', receipt.blockNumber);
  console.log('  Gas used:', receipt.gasUsed.toString());

  if (receipt.status === 'success') {
    // Read the Transfer event to get the agentId
    const transferLog = receipt.logs.find(
      log => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    );

    if (transferLog && transferLog.topics[3]) {
      const agentId = BigInt(transferLog.topics[3]);
      console.log('\n  Agent ID:', agentId.toString());
      console.log(`  View: https://etherscan.io/nft/${IDENTITY_REGISTRY}/${agentId}`);
    }

    console.log('\nRegistration successful!');
    console.log(`Verify: https://etherscan.io/tx/${txHash}`);
  } else {
    console.error('\nRegistration failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
