import { createPublicClient, http, formatEther } from 'viem'
import { mainnet } from 'viem/chains'
import { chainlinkAggregatorAbi } from './abi'
import { CHAINLINK_ETH_USD, ESTIMATED_GAS, GAS_BUFFER, RPC_URL } from './config'

function getPublicClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL()),
  })
}

export async function getEthPriceUSD(): Promise<number> {
  const client = getPublicClient()
  const [, answer] = await client.readContract({
    address: CHAINLINK_ETH_USD,
    abi: chainlinkAggregatorAbi,
    functionName: 'latestRoundData',
  })
  // Chainlink ETH/USD has 8 decimals
  return Number(answer) / 1e8
}

export async function estimateGasFee(): Promise<{
  gasFeeUSDC: bigint
  estimatedGasETH: string
  ethPriceUSD: number
}> {
  const client = getPublicClient()
  const [gasPrice, ethPriceUSD] = await Promise.all([
    client.getGasPrice(),
    getEthPriceUSD(),
  ])

  const gasCostWei = ESTIMATED_GAS * gasPrice
  const gasCostETH = formatEther(gasCostWei)
  const gasCostUSD = Number(gasCostETH) * ethPriceUSD
  // Convert to USDC (6 decimals), apply buffer, ceil to integer
  const gasFeeUSDC = BigInt(Math.ceil(gasCostUSD * 1e6 * GAS_BUFFER))

  return {
    gasFeeUSDC,
    estimatedGasETH: gasCostETH,
    ethPriceUSD,
  }
}
