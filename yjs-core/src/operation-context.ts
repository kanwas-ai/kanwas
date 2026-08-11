import { bindLoggerContext, type Logger } from './logger.js'

export interface OperationContext {
  correlationId?: string
  logger?: Logger
}

export function getContextLogger(baseLogger: Logger, context?: OperationContext): Logger {
  if (!context) {
    return baseLogger
  }

  if (context.logger) {
    return context.logger
  }

  if (context.correlationId) {
    return bindLoggerContext(baseLogger, { correlationId: context.correlationId })
  }

  return baseLogger
}
