import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  type Address,
  type Hex,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { facilitatorAbi, usdcAbi } from './abi'
import {
  RELAY_PRIVATE_KEY,
  RPC_URL,
  FACILITATOR_ADDRESS,
  USDC_ADDRESS,
} from './config'

function getClients() {
  const transport = http(RPC_URL())
  const account = privateKeyToAccount(RELAY_PRIVATE_KEY())
  const publicClient = createPublicClient({ chain: mainnet, transport })
  const walletClient = createWalletClient({ chain: mainnet, transport, account })
  return { publicClient, walletClient, account }
}

export async function submitFacilitation(params: {
  sender: Address
  recipient: Address
  amount: bigint
  gasFeeUSDC: bigint
  deadline: bigint
  v: number
  r: Hex
  s: Hex
}): Promise<Hex> {
  const { publicClient, walletClient } = getClients()

  // Check sender balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [params.sender],
  })

  const required = params.amount + params.gasFeeUSDC
  if (balance < required) {
    throw new Error(
      `Insufficient USDC balance: ${balance} < ${required}`
    )
  }

  const hash = await walletClient.writeContract({
    address: FACILITATOR_ADDRESS(),
    abi: facilitatorAbi,
    functionName: 'facilitate',
    args: [
      params.sender,
      params.recipient,
      params.amount,
      params.gasFeeUSDC,
      params.deadline,
      params.v,
      params.r,
      params.s,
    ],
  })

  return hash
}

export async function getTxStatus(txHash: Hex) {
  const { publicClient } = getClients()
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    actualGasCostETH: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
  }
}

export async function getHealth() {
  const { publicClient, account } = getClients()

  const [ethBalance, feeBalance, gasPrice] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({
      address: FACILITATOR_ADDRESS(),
      abi: facilitatorAbi,
      functionName: 'feeBalance',
    }),
    publicClient.getGasPrice(),
  ])

  return {
    relayAddress: account.address,
    relayETHBalance: formatEther(ethBalance),
    contractFeeBalanceUSDC: (Number(feeBalance) / 1e6).toFixed(6),
    currentGasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
    facilitatorAddress: FACILITATOR_ADDRESS(),
  }
}
