import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  createDefaultClient,
  createRuntimeOptionsFromEnv,
  getToolDefinitions,
  runPrimevTool,
  type PrimevClientLike,
  type PrimevToolName,
} from './tools.js'

export interface PrimevMcpServerOptions {
  client?: PrimevClientLike
  settleEnabled?: boolean
}

export function createPrimevMcpServer(options: PrimevMcpServerOptions = {}): Server {
  const runtimeOptions = createRuntimeOptionsFromEnv()
  const client = options.client ?? createDefaultClient(runtimeOptions)
  const settleEnabled = options.settleEnabled ?? runtimeOptions.settleEnabled

  const server = new Server(
    {
      name: 'primev-facilitator-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name as PrimevToolName
    const args = (request.params.arguments ?? {}) as Record<string, unknown>

    try {
      const result = await runPrimevTool({
        name: toolName,
        args,
        client,
        settleEnabled,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      }
    }
  })

  return server
}

export async function startPrimevMcpServer(options: PrimevMcpServerOptions = {}): Promise<void> {
  const server = createPrimevMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
