import { SyncManager } from './sync-manager.js'
import { LiveStateServer } from './live-state-server.js'
import { FileWatcher, type WatchEvent } from './watcher.js'
import { createLogger } from './logger.js'
import { initSentry, flush as flushSentry } from './sentry.js'

interface Config {
  workspaceId: string
  yjsServerHost: string
  workspacePath: string
  protocol: 'ws' | 'wss'
  backendUrl: string
  authToken: string
  logLevel: string
  prettyLogs: boolean
  userId: string
  correlationId: string
  sentryDsn: string
}

function getConfig(): Config {
  const workspaceId = process.env.WORKSPACE_ID
  const yjsServerHost = process.env.YJS_SERVER_HOST
  const workspacePath = process.env.WORKSPACE_PATH ?? '/workspace'
  const protocol = (process.env.YJS_SERVER_PROTOCOL ?? 'ws') as 'ws' | 'wss'
  const backendUrl = process.env.BACKEND_URL
  const authToken = process.env.AUTH_TOKEN
  const logLevel = process.env.LOG_LEVEL ?? 'info'
  const prettyLogs = process.env.PRETTY_LOGS === 'true'
  const userId = process.env.USER_ID
  const correlationId = process.env.CORRELATION_ID ?? crypto.randomUUID()
  const sentryDsn = process.env.SENTRY_DSN ?? ''

  // Create a temporary logger for validation errors (with context for tracing)
  const tempLogger = createLogger({
    workspaceId: 'startup',
    userId,
    correlationId,
    level: 'error',
  })

  if (!workspaceId) {
    tempLogger.fatal('WORKSPACE_ID environment variable is required')
    process.exit(1)
  }

  if (!yjsServerHost) {
    tempLogger.fatal('YJS_SERVER_HOST environment variable is required')
    process.exit(1)
  }

  if (!backendUrl) {
    tempLogger.fatal('BACKEND_URL environment variable is required')
    process.exit(1)
  }

  if (!authToken) {
    tempLogger.fatal('AUTH_TOKEN environment variable is required')
    process.exit(1)
  }

  if (!userId) {
    tempLogger.fatal('USER_ID environment variable is required')
    process.exit(1)
  }

  return {
    workspaceId,
    yjsServerHost,
    workspacePath,
    protocol,
    backendUrl,
    authToken,
    logLevel,
    prettyLogs,
    userId,
    correlationId,
    sentryDsn,
  }
}

/**
 * Main entry point for the execution environment.
 *
 * This script:
 * 1. Connects to the Yjs server and hydrates the workspace filesystem
 * 2. Starts a file watcher for bidirectional sync
 * 3. Keeps the connection alive for continuous sync
 */
async function main(): Promise<void> {
  const config = getConfig()

  // Create the root logger with full context
  const logger = createLogger({
    workspaceId: config.workspaceId,
    userId: config.userId,
    correlationId: config.correlationId,
    level: config.logLevel,
    pretty: config.prettyLogs,
  })

  // Initialize Sentry (must happen after logger is created for pinoIntegration)
  initSentry({
    dsn: config.sentryDsn,
    workspaceId: config.workspaceId,
    userId: config.userId,
    correlationId: config.correlationId,
  })

  logger.info(
    {
      yjsServerHost: config.yjsServerHost,
      protocol: config.protocol,
      workspacePath: config.workspacePath,
      backendUrl: config.backendUrl,
      logLevel: config.logLevel,
    },
    'Kanwas Execution Environment starting'
  )

  // Initialize sync manager
  const syncManager = new SyncManager({
    ...config,
    logger,
  })
  const liveStateServer = new LiveStateServer(syncManager, logger)

  try {
    await syncManager.initialize()
    await liveStateServer.start()
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to initialize')
    process.exit(1)
  }

  // Start file watcher
  logger.debug('Starting file watchers')

  let readyWatcherCount = 0
  const onWatcherReady = () => {
    readyWatcherCount += 1
    if (readyWatcherCount === 2) {
      logger.info('Bidirectional sync is active - ready and waiting for file changes')
    }
  }

  const immediateTextWatcher = new FileWatcher({
    watchPaths: [`${config.workspacePath}/**/*.md`, `${config.workspacePath}/**/*.yaml`],
    logger,
    awaitWriteFinish: false,
    onFileChange: async (event: WatchEvent) => {
      if (event.type === 'rename') {
        await syncManager.handleRename(event.oldPath, event.path, event.isDirectory)
        return
      }

      await syncManager.handleFileChange(event.type, event.path)
    },
    onReady: onWatcherReady,
    onError: (error) => {
      logger.error({ error: error.message }, 'Watcher error')
    },
  })

  const settledWatcher = new FileWatcher({
    watchPath: config.workspacePath,
    logger,
    ignored: ['**/*.md', '**/*.yaml'],
    onFileChange: async (event: WatchEvent) => {
      if (event.type === 'rename') {
        await syncManager.handleRename(event.oldPath, event.path, event.isDirectory)
        return
      }

      await syncManager.handleFileChange(event.type, event.path)
    },
    onReady: onWatcherReady,
    onError: (error) => {
      logger.error({ error: error.message }, 'Watcher error')
    },
  })

  immediateTextWatcher.start()
  settledWatcher.start()

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down')
    await Promise.all([immediateTextWatcher.stop(), settledWatcher.stop()])
    await liveStateServer.stop()
    syncManager.shutdown()
    await flushSentry()
    logger.info('Goodbye')
    process.exit(0)
  }

  process.on('SIGINT', () => {
    shutdown()
  })

  process.on('SIGTERM', () => {
    shutdown()
  })
}

// Run
main().catch(async (error) => {
  // Create a fallback logger for unhandled errors
  const logger = createLogger({ workspaceId: 'error', level: 'error' })
  logger.fatal({ err: error }, 'Unhandled error')
  await flushSentry()
  process.exit(1)
})
