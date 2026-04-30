import pino from 'pino'
import { captureLog as captureSentryLog, type SentryLogLevel } from './sentry.js'

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(context: LogContext, message: string): void
  info(context: LogContext, message: string): void
  warn(context: LogContext, message: string): void
  error(context: LogContext, message: string): void
  child(context: LogContext): Logger
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type PinoLogger = ReturnType<typeof pino>

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
}

let rootLogger: PinoLogger | null = null

function getRootLogger(): PinoLogger {
  if (rootLogger) {
    return rootLogger
  }

  rootLogger = pino({
    name: 'yjs-server',
    level: resolveConfiguredLogLevel(),
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }) as PinoLogger

  return rootLogger
}

function resolveConfiguredLogLevel(): LogLevel {
  const configuredLevel = (process.env.YJS_SERVER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info').trim().toLowerCase()

  switch (configuredLevel) {
    case 'debug':
    case 'warn':
    case 'error':
      return configuredLevel
    default:
      return 'info'
  }
}

function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[resolveConfiguredLogLevel()]
}

function normalizeLogContext(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined))
}

function writeLog(level: LogLevel, bindings: LogContext, context: LogContext, message: string): void {
  const nextContext = normalizeLogContext(context)
  const mergedContext = Object.keys(bindings).length > 0 ? { ...bindings, ...nextContext } : nextContext

  getRootLogger()[level](mergedContext, message)

  if (isLevelEnabled(level)) {
    captureSentryLog(level as SentryLogLevel, message, mergedContext)
  }
}

function createLogger(bindings: LogContext = {}): Logger {
  return {
    debug: (context, message) => {
      writeLog('debug', bindings, context, message)
    },
    info: (context, message) => {
      writeLog('info', bindings, context, message)
    },
    warn: (context, message) => {
      writeLog('warn', bindings, context, message)
    },
    error: (context, message) => {
      writeLog('error', bindings, context, message)
    },
    child: (context) => {
      const childBindings = normalizeLogContext(context)

      if (Object.keys(childBindings).length === 0) {
        return createLogger(bindings)
      }

      return createLogger({ ...bindings, ...childBindings })
    },
  }
}

export function bindLoggerContext(baseLogger: Logger, context: LogContext): Logger {
  const bindings = normalizeLogContext(context)

  if (Object.keys(bindings).length === 0) {
    return baseLogger
  }

  return baseLogger.child(bindings)
}

export const logger = createLogger()

export function createRoomLogger(workspaceId: string): Logger {
  return bindLoggerContext(logger, { workspaceId })
}
