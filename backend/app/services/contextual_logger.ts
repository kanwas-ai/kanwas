import type { Logger } from '@adonisjs/core/logger'
import rootLogger from '@adonisjs/core/services/logger'
import { ContextualLoggerContract } from '#contracts/contextual_logger'
import type { LogContext } from '#contracts/log_context'

/**
 * Implementation of ContextualLoggerContract that wraps an AdonisJS Logger
 * with request context (correlationId, userId, workspaceId).
 */
export class ContextualLogger extends ContextualLoggerContract {
  constructor(
    public readonly logger: Logger,
    public readonly context: LogContext = {}
  ) {
    super()
  }

  /**
   * Create a child logger with additional bindings
   */
  child(bindings: Record<string, unknown>): ContextualLogger {
    // The logger.child() applies the bindings - we keep the original context
    // since context is for the core tracing fields (correlationId, userId, workspaceId)
    return new ContextualLogger(this.logger.child(bindings), this.context)
  }

  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.info(objOrMsg)
    } else {
      this.logger.info(objOrMsg, msg)
    }
  }

  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.warn(objOrMsg)
    } else {
      this.logger.warn(objOrMsg, msg)
    }
  }

  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.error(objOrMsg)
    } else {
      this.logger.error(objOrMsg, msg)
    }
  }

  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (typeof objOrMsg === 'string') {
      this.logger.debug(objOrMsg)
    } else {
      this.logger.debug(objOrMsg, msg)
    }
  }

  /**
   * Create a fallback logger for background tasks without HTTP context.
   * Use this when running outside of an HTTP request (events, background jobs, etc.)
   */
  static createFallback(context: Partial<LogContext> = {}): ContextualLogger {
    const childLogger = rootLogger.child(context)
    return new ContextualLogger(childLogger, context)
  }
}
