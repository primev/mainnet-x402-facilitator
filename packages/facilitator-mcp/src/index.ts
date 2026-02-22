import { pathToFileURL } from 'node:url'
import { startPrimevMcpServer } from './server.js'

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false
  }
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  startPrimevMcpServer().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}

export { createPrimevMcpServer, startPrimevMcpServer } from './server.js'
export {
  createDefaultClient,
  createRuntimeOptionsFromEnv,
  getToolDefinitions,
  runPrimevTool,
} from './tools.js'
