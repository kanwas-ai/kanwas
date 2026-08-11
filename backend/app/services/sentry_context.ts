import { HttpContext } from '@adonisjs/core/http'
import { toError } from '#services/error_utils'

let sentryModulePromise: Promise<typeof import('@sentry/node') | null> | null = null
const SENTRY_CAPTURED_SYMBOL = Symbol.for('kanwas.sentry.captured')

type ErrorWithSentryMarker = Error & {
  [SENTRY_CAPTURED_SYMBOL]?: boolean
}

function isSentryEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && !!process.env.SENTRY_DSN
}

async function getSentryModule(): Promise<typeof import('@sentry/node') | null> {
  if (!isSentryEnabled()) {
    return null
  }

  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/node').catch(() => null)
  }

  return sentryModulePromise
}

function hasCapturedException(error: Error): boolean {
  return Boolean((error as ErrorWithSentryMarker)[SENTRY_CAPTURED_SYMBOL])
}

function markCapturedException(error: Error): void {
  const markedError = error as ErrorWithSentryMarker
  markedError[SENTRY_CAPTURED_SYMBOL] = true
}

export interface SentryContextOptions {
  correlationId?: string
  userId?: string
  workspaceId?: string
  operation?: string
  component?: string
}

/**
 * Wrap a background task with Sentry isolation scope and context.
 * Use this for event listeners, queue workers, cron jobs - any operation
 * that runs outside the HTTP request lifecycle.
 *
 * @example
 * ```typescript
 * import { withSentryContext } from '#services/sentry_context'
 *
 * async handle(event: MyEvent) {
 *   return withSentryContext(
 *     {
 *       userId: event.userId,
 *       workspaceId: event.workspaceId,
 *       component: 'MyEventHandler',
 *       operation: 'process_event',
 *     },
 *     async () => {
 *       // Your event handling logic here
 *     }
 *   )
 * }
 * ```
 */
export function withSentryContext<T>(options: SentryContextOptions, fn: () => Promise<T>): Promise<T> {
  if (!isSentryEnabled()) {
    return fn()
  }

  return withLoadedSentryContext(options, fn)
}

async function withLoadedSentryContext<T>(options: SentryContextOptions, fn: () => Promise<T>): Promise<T> {
  const Sentry = await getSentryModule()

  if (!Sentry) {
    return fn()
  }

  // Check if Sentry is initialized
  if (!Sentry.getClient()) {
    return fn()
  }

  return Sentry.withIsolationScope(async (scope) => {
    // Set tags from options
    if (options.correlationId) {
      scope.setTag('correlationId', options.correlationId)
    }

    if (options.userId) {
      scope.setTag('userId', options.userId)
      scope.setUser({ id: options.userId })
    }

    if (options.workspaceId) {
      scope.setTag('workspaceId', options.workspaceId)
    }

    if (options.operation) {
      scope.setTag('operation', options.operation)
    }

    if (options.component) {
      scope.setTag('component', options.component)
    }

    try {
      return await fn()
    } catch (error) {
      const capturedError = toError(error)

      if (!hasCapturedException(capturedError)) {
        Sentry.captureException(capturedError)
        markCapturedException(capturedError)
      }

      throw capturedError
    }
  })
}

/**
 * Extract context from current HTTP request (if available via AsyncLocalStorage).
 * Returns partial context - some fields may be undefined if not in an HTTP context.
 *
 * @example
 * ```typescript
 * const ctx = extractCurrentContext()
 * // { correlationId: '...', userId: '...', workspaceId: '...' }
 * ```
 */
export function extractCurrentContext(): SentryContextOptions {
  const ctx = HttpContext.get()
  return {
    correlationId: ctx?.correlationId,
    userId: ctx?.userId,
    workspaceId: ctx?.workspaceId,
  }
}

/**
 * Convenience function: wrap with current HTTP context automatically extracted,
 * merged with additional options.
 *
 * @example
 * ```typescript
 * // Inside an HTTP request handler that spawns background work
 * await withCurrentSentryContext(
 *   { component: 'BackgroundProcessor', operation: 'process_upload' },
 *   async () => {
 *     // This will have correlationId, userId, workspaceId from the HTTP request
 *     // plus the component and operation tags
 *   }
 * )
 * ```
 */
export async function withCurrentSentryContext<T>(
  additionalOptions: Partial<SentryContextOptions>,
  fn: () => Promise<T>
): Promise<T> {
  const currentContext = extractCurrentContext()
  return withSentryContext({ ...currentContext, ...additionalOptions }, fn)
}

/**
 * Capture an exception with Sentry context.
 * This is a convenience wrapper that handles Sentry not being available.
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething()
 * } catch (error) {
 *   captureException(error, {
 *     tags: { component: 'MyService', operation: 'do_something' },
 *     extra: { inputData: someData },
 *   })
 *   throw error
 * }
 * ```
 */
export async function captureException(
  error: unknown,
  options?: {
    tags?: Record<string, string>
    extra?: Record<string, unknown>
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  }
): Promise<void> {
  const capturedError = toError(error)

  if (hasCapturedException(capturedError)) {
    return
  }

  if (!isSentryEnabled()) {
    return
  }

  const Sentry = await getSentryModule()

  if (!Sentry) {
    return
  }

  if (!Sentry.getClient()) {
    return
  }

  Sentry.withScope((scope) => {
    if (options?.tags) {
      scope.setTags(options.tags)
    }
    if (options?.extra) {
      scope.setExtras(options.extra)
    }
    if (options?.level) {
      scope.setLevel(options.level)
    }
    Sentry.captureException(capturedError)
    markCapturedException(capturedError)
  })
}
