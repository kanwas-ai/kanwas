import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * HTTP logger middleware logs incoming HTTP requests and their responses.
 *
 * Note: Runs after request_context_middleware which adds correlationId to logger.
 */
export default class HttpLoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, logger, response, auth } = ctx
    const startTime = Date.now()

    // Call next middleware/controller
    await next()

    // Log response after request is processed
    const durationMs = Date.now() - startTime
    const statusCode = response.getStatus()

    // Build log context
    const logContext: Record<string, unknown> = {
      ip: request.ip(),
      statusCode,
      durationMs,
    }

    // Add user info if authenticated
    try {
      const user = auth.user
      if (user) {
        logContext.userId = user.id
        logContext.userEmail = user.email
      }
    } catch {
      // Auth not initialized or no user - that's fine
    }

    // Log at appropriate level based on status code
    const message = `${request.method()} ${request.url()} ${statusCode} ${durationMs}ms`

    if (statusCode >= 500) {
      logger.error(logContext, message)
    } else if (statusCode >= 400) {
      logger.warn(logContext, message)
    } else {
      logger.info(logContext, message)
    }
  }
}
