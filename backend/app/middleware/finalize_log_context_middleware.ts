import { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ContextualLoggerContract } from '#contracts/contextual_logger'
import { ContextualLogger } from '#services/contextual_logger'

/**
 * Middleware that finalizes the logging context after authentication.
 * Must run AFTER auth middleware on protected routes.
 *
 * This middleware:
 * 1. Sets ctx.userId from the authenticated user
 * 2. Rebinds ContextualLoggerContract with complete context (including userId)
 */
export default class FinalizeLogContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Set userId from authenticated user
    const userId = ctx.auth?.user?.id
    if (userId) {
      ctx.userId = userId

      // Rebind ContextualLoggerContract with complete context (now including userId)
      const contextualLogger = new ContextualLogger(ctx.logger.child({ userId }), {
        correlationId: ctx.correlationId,
        workspaceId: ctx.workspaceId,
        userId,
      })
      ctx.containerResolver.bindValue(ContextualLoggerContract, contextualLogger)
    }

    return next()
  }
}
