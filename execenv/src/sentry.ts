import { createRequire } from 'node:module'
import * as Sentry from '@sentry/node'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

interface SentryConfig {
  dsn: string
  workspaceId: string
  userId: string
  correlationId: string
}

let initialized = false

export function initSentry(config: SentryConfig): void {
  if (!config.dsn || initialized) return

  Sentry.init({
    dsn: config.dsn,
    release: `execenv@${version}`,
    environment: 'sandbox',

    // Tracing - lower sample rate for sandbox
    tracesSampleRate: 0.1,

    // Logs
    _experiments: { enableLogs: true },
    beforeSendLog: (log) => {
      // Scrub sensitive data
      if (log.attributes) {
        const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'authorization']
        for (const key of sensitiveKeys) {
          if (key in log.attributes) delete log.attributes[key]
        }
      }
      return log
    },

    // Integrations
    integrations: [
      Sentry.pinoIntegration({
        log: { levels: ['info', 'warn', 'error', 'fatal'] },
        error: { levels: ['error', 'fatal'], handled: true },
      }),
    ],

    // Default tags
    initialScope: {
      tags: {
        workspaceId: config.workspaceId,
        userId: config.userId,
        correlationId: config.correlationId,
        component: 'execenv',
      },
    },
  })

  initialized = true
}

export function captureException(error: Error, extra?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(error, { extra })
}

export async function flush(): Promise<void> {
  if (!initialized) return
  await Sentry.close(2000)
}
