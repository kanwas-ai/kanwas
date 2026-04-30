import type { Logger } from '@adonisjs/core/logger'
import type { LogContext } from '#contracts/log_context'

/**
 * Contract for contextual logger that services can inject.
 * Wraps the AdonisJS Logger with request context (correlationId, userId, workspaceId).
 *
 * Services should inject this contract via @inject() decorator to automatically
 * receive a logger with the current request context.
 */
export abstract class ContextualLoggerContract {
  /**
   * The current logging context
   */
  abstract readonly context: LogContext

  /**
   * The underlying AdonisJS logger instance
   */
  abstract readonly logger: Logger

  /**
   * Create a child logger with additional bindings
   */
  abstract child(bindings: Record<string, unknown>): ContextualLoggerContract

  /**
   * Log at info level
   */
  abstract info(obj: Record<string, unknown>, msg?: string): void
  abstract info(msg: string): void

  /**
   * Log at warn level
   */
  abstract warn(obj: Record<string, unknown>, msg?: string): void
  abstract warn(msg: string): void

  /**
   * Log at error level
   */
  abstract error(obj: Record<string, unknown>, msg?: string): void
  abstract error(msg: string): void

  /**
   * Log at debug level
   */
  abstract debug(obj: Record<string, unknown>, msg?: string): void
  abstract debug(msg: string): void
}
