import pino from 'pino'

export type { Logger } from 'pino'

/**
 * Create a configured Pino logger for execenv.
 *
 * @param workspaceId - The workspace ID to include in all log entries
 * @param options - Optional logger configuration
 */
export function createLogger(options: {
  workspaceId: string
  userId?: string
  correlationId?: string
  level?: string
  pretty?: boolean
}) {
  const { workspaceId, userId, correlationId, level = 'info', pretty = false } = options

  return pino({
    name: 'execenv',
    level,
    base: { workspaceId, userId, correlationId },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}

/**
 * Generate a correlation ID for tracing operations across services.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID()
}

/**
 * Create a child logger with a correlation ID.
 */
export function withCorrelationId(logger: pino.Logger, correlationId?: string): pino.Logger {
  return logger.child({ correlationId: correlationId ?? generateCorrelationId() })
}
