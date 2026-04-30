import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Sets Sentry tags for correlationId and workspaceId.
 * This middleware runs AFTER RequestContextMiddleware so these values are available.
 *
 * For userId, use SentryUserMiddleware which runs after auth.
 */
export default class SentryTagsMiddleware {
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

    // Set correlationId tag (set by RequestContextMiddleware)
    if (ctx.correlationId) {
      Sentry.setTag('correlationId', ctx.correlationId)
    }

    // Set workspaceId tag (set by RequestContextMiddleware)
    if (ctx.workspaceId) {
      Sentry.setTag('workspaceId', ctx.workspaceId)
    }

    return next()
  }
}
