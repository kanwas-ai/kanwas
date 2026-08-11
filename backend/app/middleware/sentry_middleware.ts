import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Sentry middleware that creates an isolation scope and performance span
 * for each HTTP request. This must run early in the middleware stack.
 *
 * Tags (correlationId, workspaceId, userId) are set by subsequent middleware
 * (SentryTagsMiddleware and SentryUserMiddleware) after they become available.
 */
export default class SentryMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Dynamic import to avoid loading Sentry when disabled
    let Sentry: typeof import('@sentry/node')
    try {
      Sentry = await import('@sentry/node')
    } catch {
      // Sentry not available, just continue
      return next()
    }

    // Check if Sentry is initialized
    if (!Sentry.getClient()) {
      return next()
    }

    return Sentry.withIsolationScope(async (scope) => {
      // Set basic request context
      scope.setTag('http.method', ctx.request.method())
      scope.setTag('http.url', ctx.request.url())

      // Set request context for error details
      scope.setContext('request', {
        method: ctx.request.method(),
        url: ctx.request.url(),
        headers: ctx.request.headers(),
        query: ctx.request.qs(),
      })

      // Start HTTP span for performance tracing
      return Sentry.startSpan(
        {
          name: ctx.route?.pattern || ctx.request.url(),
          op: 'http.server',
          attributes: {
            'http.method': ctx.request.method(),
            'http.url': ctx.request.url(),
            'http.route': ctx.route?.pattern,
          },
        },
        async (span) => {
          try {
            await next()

            // Set status code after response
            const statusCode = ctx.response.getStatus()
            span.setAttribute('http.status_code', statusCode)

            if (statusCode >= 400) {
              span.setStatus({ code: 2, message: `HTTP ${statusCode}` }) // ERROR status
            }
          } catch (error) {
            span.setStatus({ code: 2, message: 'Internal error' })
            throw error
          }
        }
      )
    })
  }
}
