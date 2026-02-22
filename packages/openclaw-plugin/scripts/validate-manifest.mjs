import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const manifestPath = resolve(process.cwd(), 'openclaw.plugin.json')
const raw = await readFile(manifestPath, 'utf8')
const manifest = JSON.parse(raw)

if (!manifest.entry || typeof manifest.entry !== 'string') {
  throw new Error('openclaw.plugin.json must define an entry field')
}

if (!manifest.configSchema || manifest.configSchema.type !== 'object') {
  throw new Error('openclaw.plugin.json must define an object configSchema')
}

const properties = manifest.configSchema.properties ?? {}
for (const key of ['FACILITATOR_BASE_URL', 'FACILITATOR_TIMEOUT_MS', 'PRIMEV_ENABLE_SETTLE']) {
  if (!(key in properties)) {
    throw new Error(`openclaw.plugin.json missing configSchema property: ${key}`)
  }
}

console.log('OpenClaw manifest is valid')
