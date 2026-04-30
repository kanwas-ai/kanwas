import { loadConfig } from './config.js'
import { getErrorLogContext } from './error-utils.js'
import { logger } from './logger.js'
import { captureException, flush as flushSentry, initSentry } from './sentry.js'
import { startYjsServer } from './server.js'

async function main(): Promise<void> {
  initSentry({
    dsn: process.env.SENTRY_DSN?.trim() ?? '',
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV?.trim() || 'development',
  })

  const config = loadConfig()

  logger.info(
    {
      backendNotificationsEnabled: config.backendNotificationsEnabled,
      host: config.host,
      logLevel: config.logLevel,
      port: config.port,
      saveDebounceMs: config.saveDebounceMs,
      sentryEnabled: config.sentry.enabled,
      sharedLinkResolutionEnabled: config.sharedLinkResolutionEnabled,
      socketPingIntervalMs: config.socketPingIntervalMs,
      socketPingTimeoutMs: config.socketPingTimeoutMs,
      storageDriver: config.storageDriver,
    },
    'Starting Yjs server'
  )

  const server = await startYjsServer({
    adminSecret: config.adminSecret,
    backendNotifier: config.backendNotifier,
    documentShareResolver: config.documentShareResolver,
    host: config.host,
    logger,
    port: config.port,
    saveDebounceMs: config.saveDebounceMs,
    socketPingIntervalMs: config.socketPingIntervalMs,
    socketPingTimeoutMs: config.socketPingTimeoutMs,
    store: config.store,
  })

  logger.info({ host: config.host, port: config.port }, 'Yjs server listening')

  let shuttingDown = false

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    logger.info({ signal }, 'Shutting down Yjs server')

    try {
      await server.close()
    } catch (error) {
      logger.error({ ...getErrorLogContext(error), signal }, 'Failed to shut down Yjs server cleanly')
      captureException(error, { phase: 'shutdown', signal })
    }

    await flushSentry()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

main().catch(async (error) => {
  logger.error(getErrorLogContext(error), 'Failed to start Yjs server')
  captureException(error, { phase: 'startup' })
  await flushSentry()
  process.exit(1)
})
