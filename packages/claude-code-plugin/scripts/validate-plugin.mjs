import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const pluginPath = resolve(process.cwd(), '.claude-plugin/plugin.json')
const raw = await readFile(pluginPath, 'utf8')
const manifest = JSON.parse(raw)

if (!manifest.mcpServers || typeof manifest.mcpServers !== 'object') {
  throw new Error('plugin.json must define a non-empty mcpServers object')
}

if (!manifest.mcpServers['primev-facilitator']) {
  throw new Error('plugin.json must include the primev-facilitator MCP server entry')
}

const server = manifest.mcpServers['primev-facilitator']
if (server.command !== 'node') {
  throw new Error('primev-facilitator command must be set to node')
}

if (!Array.isArray(server.args) || server.args.length === 0) {
  throw new Error('primev-facilitator args must include MCP entrypoint path')
}

if (server.args[0] !== '${CLAUDE_PLUGIN_ROOT}/../facilitator-mcp/dist/index.js') {
  throw new Error('primev-facilitator args[0] must target ../facilitator-mcp/dist/index.js')
}

console.log('Claude plugin manifest is valid')
