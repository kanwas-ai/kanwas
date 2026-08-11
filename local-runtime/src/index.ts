import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { attachYjsCore } from '@kanwas/yjs-core'
import type { Logger } from 'pino'
import type { VaultSummary, WorkspaceSummary } from 'shared/local-api'
import { FolderStore } from './folder-store.js'
import { generateSecret } from './identity.js'
import { createLogger } from './logger.js'
import { MountManager } from './mount-manager.js'
import { attachRestServer } from './rest-server.js'
import { hydrateTerminalEnvironment } from './terminal/agents.js'
import { TerminalSessionManager } from './terminal/session-manager.js'
import { VaultService } from './vault-service.js'

export const LOCAL_RUNTIME_HOST = '127.0.0.1' as const
export const LOCAL_RUNTIME_PORT = 4300
export const YJS_SOCKET_PATH = '/yjs/socket.io' as const

export interface LocalRuntimeOptions {
  stateDir: string
  rendererDir: string
  templatesDir: string
  logFile?: string
  logLevel?: string
  logger?: Logger
  host?: typeof LOCAL_RUNTIME_HOST
  port?: number
  /** Override only for tests. The legacy file is read, never modified. */
  legacyRegistryFile?: string
}

export interface LocalRuntimeHandle {
  readonly origin: string
  listVaults(): VaultSummary[]
  getActiveVault(): VaultSummary | undefined
  openVault(folder: string, label?: string): Promise<WorkspaceSummary>
  activateVault(workspaceId: string): Promise<WorkspaceSummary>
  renameVaultLabel(workspaceId: string, label: string): WorkspaceSummary
  forgetVault(workspaceId: string): Promise<void>
  flushAll(): Promise<void>
  close(): Promise<void>
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

/** Start the Electron-owned local application runtime. No process globals or signals are installed. */
export async function startLocalRuntime(options: LocalRuntimeOptions): Promise<LocalRuntimeHandle> {
  const host = options.host ?? LOCAL_RUNTIME_HOST
  const port = options.port ?? LOCAL_RUNTIME_PORT
  if (host !== LOCAL_RUNTIME_HOST) throw new Error('The local runtime may only bind to 127.0.0.1')
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid local runtime port: ${port}`)
  const rendererIndex = path.join(options.rendererDir, 'index.html')
  if (!fs.existsSync(rendererIndex)) throw new Error(`Renderer build not found: ${rendererIndex}`)

  fs.mkdirSync(options.stateDir, { recursive: true })
  await hydrateTerminalEnvironment()
  const logger = options.logger ?? createLogger({ level: options.logLevel, logFile: options.logFile })
  const log = logger.child({ component: 'LocalRuntime' })
  const origin = `http://${host}:${port}`
  const registryFile = path.join(options.stateDir, 'vaults.json')
  const legacyRegistryFile = options.legacyRegistryFile ?? path.join(os.homedir(), '.kanwas', 'vaults.json')
  const secret = generateSecret()
  const httpServer = createServer()
  const store = new FolderStore()
  const yjsCore = attachYjsCore({
    httpServer,
    logger,
    store,
    tokenSecret: secret,
    socketPath: YJS_SOCKET_PATH,
    allowedOrigin: origin,
  })
  const mountManager = new MountManager({
    roomManager: yjsCore.roomManager,
    store,
    secret,
    yjsOrigin: origin,
    yjsSocketPath: YJS_SOCKET_PATH,
    templatesDir: options.templatesDir,
    logger,
  })
  const terminalManager = new TerminalSessionManager({ logger })
  const vaultService = new VaultService({
    registryFile,
    legacyRegistryFile,
    mountManager,
    logger,
    disposeWorkspace: (workspaceId) => terminalManager.disposeWorkspace(workspaceId),
  })
  const rest = attachRestServer({
    server: httpServer,
    origin,
    mountManager,
    roomManager: yjsCore.roomManager,
    secret,
    logger,
    rendererDir: options.rendererDir,
    terminalManager,
    getWorkspaceName: (workspaceId) => vaultService.getWorkspaceName(workspaceId),
  })

  let closeTask: Promise<void> | null = null
  const close = (): Promise<void> => {
    if (closeTask) return closeTask
    closeTask = (async () => {
      const errors: unknown[] = []
      const attempt = async (operation: () => Promise<void>): Promise<void> => {
        try {
          await operation()
        } catch (error) {
          errors.push(error)
        }
      }
      await attempt(() => terminalManager.disposeAll())
      await attempt(() => mountManager.stopAll())
      await attempt(() => rest.close())
      await attempt(() => yjsCore.close())
      await attempt(() => closeServer(httpServer))
      log.info('Local runtime stopped')
      if (errors.length > 0) throw new AggregateError(errors, 'Local runtime stopped with cleanup errors')
    })()
    return closeTask
  }

  try {
    await listen(httpServer, port, host)
    await vaultService.initialize()
    log.info({ origin, mountedVaults: mountManager.list().length }, 'Local runtime ready')
  } catch (error) {
    await close().catch(() => undefined)
    throw error
  }

  const flushAll = async (): Promise<void> => {
    await Promise.all(
      mountManager.list().map(async (mount) => {
        await yjsCore.roomManager.flushWorkspace(mount.workspaceId)
        await mount.orchestrator.flusher.flushNow()
      })
    )
  }

  return {
    origin,
    listVaults: () => vaultService.listVaults(),
    getActiveVault: () => vaultService.getActiveVault(),
    openVault: (folder, label) => vaultService.openVault(folder, label),
    activateVault: (workspaceId) => vaultService.activateVault(workspaceId),
    renameVaultLabel: (workspaceId, label) => vaultService.renameVaultLabel(workspaceId, label),
    forgetVault: (workspaceId) => vaultService.forgetVault(workspaceId),
    flushAll,
    close,
  }
}
