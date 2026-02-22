import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface LoggerLike {
  info?: (message: string) => void
  warn?: (message: string) => void
  error?: (message: string) => void
}

interface OpenClawRegisterApi {
  registerProvider?: (provider: unknown) => void
  registerMcpProvider?: (provider: unknown) => void
  onShutdown?: (handler: () => void) => void
  logger?: LoggerLike
  log?: LoggerLike
}

interface ChildProcessLike {
  killed: boolean
  kill: (signal?: NodeJS.Signals | number) => boolean
  on?: ChildProcess['on']
  stderr?: NodeJS.ReadableStream | null
}

interface RegisterOptions {
  spawnProcess?: (
    command: string,
    args: string[],
    options: {
      env: NodeJS.ProcessEnv
      stdio: ['pipe', 'pipe', 'pipe']
    }
  ) => ChildProcessLike
  nodeCommand?: string
  attachProcessHandlers?: boolean
}

interface ProviderSpec {
  id: string
  name: string
  type: 'mcp'
  transport: {
    type: 'stdio'
    command: string
    args: string[]
    env: Record<string, string>
  }
}

interface RegisterResult {
  provider: ProviderSpec
  child: ChildProcessLike
  cleanup: () => void
}

const PROVIDER_ID = 'primev-facilitator-mcp'

export function register(api: OpenClawRegisterApi, options: RegisterOptions = {}): RegisterResult {
  const provider = createProviderSpec(options.nodeCommand)
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess
  const child = spawnProcess(provider.transport.command, provider.transport.args, {
    env: {
      ...process.env,
      ...provider.transport.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  child.on?.('error', (error: Error) => {
    getLogger(api).error?.(`Primev MCP process error: ${error.message}`)
  })

  const providerRegistrationApi = api.registerProvider ?? api.registerMcpProvider
  if (providerRegistrationApi) {
    providerRegistrationApi(provider)
  } else {
    getLogger(api).warn?.('No registerProvider/registerMcpProvider API found on OpenClaw register api.')
  }

  const cleanup = () => {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  api.onShutdown?.(cleanup)

  if (options.attachProcessHandlers !== false) {
    process.once('exit', cleanup)
    process.once('SIGINT', cleanup)
    process.once('SIGTERM', cleanup)
  }

  getLogger(api).info?.(`Registered OpenClaw provider: ${PROVIDER_ID}`)

  return { provider, child, cleanup }
}

export function createProviderSpec(nodeCommand = process.execPath): ProviderSpec {
  const mcpEntrypoint = resolveMcpEntrypoint()

  return {
    id: PROVIDER_ID,
    name: 'Primev Facilitator MCP',
    type: 'mcp',
    transport: {
      type: 'stdio',
      command: nodeCommand,
      args: [mcpEntrypoint],
      env: {
        FACILITATOR_BASE_URL: process.env.FACILITATOR_BASE_URL ?? 'https://facilitator.primev.xyz',
        FACILITATOR_TIMEOUT_MS: process.env.FACILITATOR_TIMEOUT_MS ?? '10000',
        PRIMEV_ENABLE_SETTLE: process.env.PRIMEV_ENABLE_SETTLE ?? 'true',
      },
    },
  }
}

export default {
  register,
}

function resolveMcpEntrypoint(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return resolve(currentDir, '../../facilitator-mcp/dist/index.js')
}

function getLogger(api: OpenClawRegisterApi): LoggerLike {
  return api.logger ?? api.log ?? {}
}

function defaultSpawnProcess(
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    stdio: ['pipe', 'pipe', 'pipe']
  }
): ChildProcessLike {
  return spawn(command, args, options)
}
