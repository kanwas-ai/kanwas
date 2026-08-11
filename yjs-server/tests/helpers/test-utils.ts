import type { LogContext, Logger } from '../../src/logger.js'

export interface CapturedLogEntry {
  context: LogContext
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, reject, resolve }
}

export function createNoopLogger(): Logger {
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return logger
    },
  }

  return logger
}

export function createCapturingLogger(): { entries: CapturedLogEntry[]; logger: Logger } {
  const entries: CapturedLogEntry[] = []

  const createLogger = (bindings: LogContext = {}): Logger => ({
    debug(context, message) {
      entries.push({ context: { ...bindings, ...context }, level: 'debug', message })
    },
    info(context, message) {
      entries.push({ context: { ...bindings, ...context }, level: 'info', message })
    },
    warn(context, message) {
      entries.push({ context: { ...bindings, ...context }, level: 'warn', message })
    },
    error(context, message) {
      entries.push({ context: { ...bindings, ...context }, level: 'error', message })
    },
    child(context) {
      return createLogger({ ...bindings, ...context })
    },
  })

  return {
    entries,
    logger: createLogger(),
  }
}
