import pino, { type Logger } from 'pino'
import path from 'node:path'
import fs from 'node:fs'

export type { Logger }

export interface CreateLoggerOptions {
  level?: string
  pretty?: boolean
  logFile?: string
}

/**
 * Root pino logger for the runtime. The FilesystemSyncer / watcher / metadata
 * machinery copied from execenv all expect a pino `Logger`, so this is the
 * logger threaded through those parts.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env.LOG_LEVEL ?? 'info'

  if (options.logFile) {
    fs.mkdirSync(path.dirname(options.logFile), { recursive: true })
    return pino(
      { level, timestamp: pino.stdTimeFunctions.isoTime },
      pino.destination({ dest: options.logFile, mkdir: true, sync: false })
    )
  }

  if (options.pretty ?? process.stdout.isTTY) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    })
  }

  return pino({ level, timestamp: pino.stdTimeFunctions.isoTime })
}
