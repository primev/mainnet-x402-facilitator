import { createPublicClient, http, keccak256, encodeAbiParameters, concat, toHex, hashTypedData } from 'viem'
import { mainnet } from 'viem/chains'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
})

// Get on-chain domain separator
const onChainDomainSeparator = await client.readContract({
  address: USDC,
  abi: [{ name: 'DOMAIN_SEPARATOR', type: 'function', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' }],
  functionName: 'DOMAIN_SEPARATOR',
})

console.log('On-chain DOMAIN_SEPARATOR:', onChainDomainSeparator)

// Compute domain separator manually
const EIP712_DOMAIN_TYPEHASH = keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'))
console.log('EIP712_DOMAIN_TYPEHASH:', EIP712_DOMAIN_TYPEHASH)

const nameHash = keccak256(toHex('USD Coin'))
const versionHash = keccak256(toHex('2'))
console.log('Name hash:', nameHash)
console.log('Version hash:', versionHash)

const computedDomainSeparator = keccak256(
  encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [EIP712_DOMAIN_TYPEHASH, nameHash, versionHash, 1n, USDC]
  )
)

console.log('Computed DOMAIN_SEPARATOR:', computedDomainSeparator)
console.log('Match:', onChainDomainSeparator === computedDomainSeparator)

// Now let's see what viem computes
const viemHash = hashTypedData({
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: USDC,
  },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
  primaryType: 'TransferWithAuthorization',
  message: {
    from: '0x0D42aa898242f52c8876688605f31E87d81A3e26',
    to: '0x488d87a9A88a6A878B3E7cf0bEece8984af9518D',
    value: 1000000n,
    validAfter: 0n,
    validBefore: 1770420310n,
    nonce: '0xfac4afc6d28915c15142bdbbd23af9c097ee0c729bdab60fa70b266e423e86c8',
  },
})

console.log('\nViem typed data hash:', viemHash)
