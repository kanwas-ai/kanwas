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

function normalizeLogContext(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined))
}

export function bindLoggerContext(baseLogger: Logger, context: LogContext): Logger {
  const bindings = normalizeLogContext(context)

  if (Object.keys(bindings).length === 0) {
    return baseLogger
  }

  return baseLogger.child(bindings)
}

/** A convenient default for tests and embedders that intentionally disable logging. */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger
  },
}
