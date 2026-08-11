/**
 * Minimal logger interface compatible with Pino.
 * Consumers pass in their logger instance; shared utilities use this interface.
 *
 * This design allows:
 * - Dependency injection from callers (execenv passes pino, backend passes AdonisJS logger)
 * - Graceful degradation with noopLogger when no logger is provided
 * - Child logger support for context propagation (correlationId, workspaceId, etc.)
 */
export interface Logger {
  info(obj: object, msg?: string): void
  info(msg: string): void
  warn(obj: object, msg?: string): void
  warn(msg: string): void
  error(obj: object, msg?: string): void
  error(msg: string): void
  debug(obj: object, msg?: string): void
  debug(msg: string): void

  /**
   * Create a child logger with bound context.
   * Used for adding workspaceId, correlationId, component names, etc.
   */
  child(bindings: Record<string, unknown>): Logger
}

/**
 * No-op logger for when logging is disabled or not provided.
 * All methods are no-ops, and child() returns the same noopLogger.
 */
export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLogger,
}
