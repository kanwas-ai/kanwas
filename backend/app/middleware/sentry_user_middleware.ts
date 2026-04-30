import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Sets Sentry user context after authentication.
 * This should be used as a named middleware on authenticated routes,
 * typically added after auth middleware in the route group.
 */
export default class SentryUserMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Dynamic import to avoid loading Sentry when disabled
    let Sentry: typeof import('@sentry/node')
    try {
      Sentry = await import('@sentry/node')
    } catch {
      return next()
    }

    // Check if Sentry is initialized
    if (!Sentry.getClient()) {
      return next()
    }

    // Set userId tag and user context (available after auth middleware)
    if (ctx.userId) {
      Sentry.setTag('userId', ctx.userId)
      Sentry.setUser({ id: ctx.userId })
    }

    return next()
  }
}
