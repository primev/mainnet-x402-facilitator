import { toHex, concat, keccak256 } from 'viem'

// Check how \x19\x01 is encoded
console.log('toHex of \\x19\\x01:', toHex('\x19\x01'))
console.log('Expected: 0x1901')

// The correct way - use literal hex
const prefix = '0x1901' as `0x${string}`
console.log('Hardcoded prefix:', prefix)

// Test concat
const ds = '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335' as `0x${string}`
const sh = '0xbf54194c9c1a60d847b843c069c8c1d635aed7656e38cee79b793ba19bab94d0' as `0x${string}`

const digest1 = keccak256(concat([toHex('\x19\x01'), ds, sh]))
const digest2 = keccak256(concat([prefix, ds, sh]))
console.log('Digest with toHex:', digest1)
console.log('Digest with hardcoded:', digest2)
console.log('Match:', digest1 === digest2)
