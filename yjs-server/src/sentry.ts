import { createRequire } from 'node:module'
import * as Sentry from '@sentry/node'
import { normalizeError } from './error-utils.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

export interface SentryOptions {
  dsn: string
  environment: string
}

export type SentryLogLevel = 'debug' | 'info' | 'warn' | 'error'

type SentryLogAttributes = Record<string, string | number | boolean>

const SENSITIVE_LOG_KEYS = new Set(['apikey', 'authorization', 'password', 'secret', 'token'])

let initialized = false

export function initSentry(options: SentryOptions): void {
  if (!options.dsn || initialized) {
    return
  }

  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: `kanwas-yjs-server@${version}`,
    _experiments: {
      enableLogs: true,
    },
    beforeSendLog: (log) => {
      if (log.attributes) {
        for (const key of Object.keys(log.attributes)) {
          if (SENSITIVE_LOG_KEYS.has(key.toLowerCase())) {
            delete log.attributes[key]
          }
        }
      }

      return log
    },
    initialScope: {
      tags: {
        component: 'yjs-server',
      },
    },
  })

  initialized = true
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!initialized) {
    return
  }

  Sentry.captureException(normalizeError(error), { extra })
}

export function captureLog(level: SentryLogLevel, message: string, attributes?: Record<string, unknown>): void {
  if (!initialized) {
    return
  }

  const logger = Sentry.logger as Partial<
    Record<SentryLogLevel, (message: string, attributes?: SentryLogAttributes) => void>
  >
  const capture = logger[level]

  if (typeof capture !== 'function') {
    return
  }

  const normalizedAttributes = normalizeLogAttributes(attributes)

  try {
    capture(message, Object.keys(normalizedAttributes).length > 0 ? normalizedAttributes : undefined)
  } catch {
    // Ignore log forwarding failures so application logging never breaks.
  }
}

export async function flush(): Promise<void> {
  if (!initialized) {
    return
  }

  try {
    await Sentry.close(2000)
  } finally {
    initialized = false
  }
}

function normalizeLogAttributes(attributes?: Record<string, unknown>): SentryLogAttributes {
  const normalized: SentryLogAttributes = {}

  if (!attributes) {
    return normalized
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue
    }

    if (typeof value === 'string' || typeof value === 'boolean') {
      normalized[key] = value
      continue
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        normalized[key] = value
      }
      continue
    }

    if (typeof value === 'bigint') {
      normalized[key] = value.toString()
      continue
    }

    if (value instanceof Error) {
      normalized[key] = normalizeError(value).message
    }
  }

  return normalized
}
