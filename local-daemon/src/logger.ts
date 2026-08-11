import pino, { type Logger } from 'pino'

export type { Logger }

export interface CreateLoggerOptions {
  level?: string
  pretty?: boolean
}

/**
 * Root pino logger for the daemon. The FilesystemSyncer / watcher / metadata
 * machinery copied from execenv all expect a pino `Logger`, so this is the
 * logger threaded through those parts.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env.LOG_LEVEL ?? 'info'

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
