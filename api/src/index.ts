import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { isAddress, type Address, type Hex } from 'viem'
import { estimateGasFee } from './gas'
import { submitFacilitation, getTxStatus, getHealth } from './relay'
import { PERMIT_DEADLINE_SECONDS, USDC_ADDRESS } from './config'

const app = new Hono()

app.use('/*', cors())

app.get('/quote', async (c) => {
  const recipient = c.req.query('recipient')
  const amountStr = c.req.query('amount')

  if (!recipient || !isAddress(recipient)) {
    return c.json({ error: 'Invalid or missing recipient address' }, 400)
  }
  if (!amountStr) {
    return c.json({ error: 'Missing amount' }, 400)
  }
  const amount = BigInt(amountStr)
  if (amount <= 0n) {
    return c.json({ error: 'Amount must be > 0' }, 400)
  }

  const { gasFeeUSDC, estimatedGasETH, ethPriceUSD } = await estimateGasFee()
  const permitValue = amount + gasFeeUSDC
  const deadline = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS

  return c.json({
    recipient,
    amount: amount.toString(),
    gasFeeUSDC: gasFeeUSDC.toString(),
    permitValue: permitValue.toString(),
    deadline,
    usdcAddress: USDC_ADDRESS,
    chainId: 1,
    estimatedGasETH,
    ethPriceUSD,
  })
})

app.post('/facilitate', async (c) => {
  const body = await c.req.json()
  const { owner, recipient, amount, gasFeeUSDC, deadline, v, r, s } = body

  if (!owner || !isAddress(owner)) {
    return c.json({ error: 'Invalid owner address' }, 400)
  }
  if (!recipient || !isAddress(recipient)) {
    return c.json({ error: 'Invalid recipient address' }, 400)
  }
  if (!amount || BigInt(amount) <= 0n) {
    return c.json({ error: 'Invalid amount' }, 400)
  }
  if (!deadline || Number(deadline) < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Deadline has passed' }, 400)
  }
  if (v === undefined || !r || !s) {
    return c.json({ error: 'Missing permit signature (v, r, s)' }, 400)
  }

  try {
    const txHash = await submitFacilitation({
      sender: owner as Address,
      recipient: recipient as Address,
      amount: BigInt(amount),
      gasFeeUSDC: BigInt(gasFeeUSDC),
      deadline: BigInt(deadline),
      v: Number(v),
      r: r as Hex,
      s: s as Hex,
    })

    return c.json({
      status: 'submitted',
      txHash,
      amount: amount.toString(),
      gasFeeUSDC: gasFeeUSDC.toString(),
      recipient,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.get('/status/:txHash', async (c) => {
  const txHash = c.req.param('txHash') as Hex

  if (!txHash || !txHash.startsWith('0x')) {
    return c.json({ error: 'Invalid transaction hash' }, 400)
  }

  try {
    const status = await getTxStatus(txHash)
    return c.json(status)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 404)
  }
})

app.get('/health', async (c) => {
  try {
    const health = await getHealth()
    return c.json({ ...health, status: 'ok' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ status: 'error', error: message }, 500)
  }
})

export default app
