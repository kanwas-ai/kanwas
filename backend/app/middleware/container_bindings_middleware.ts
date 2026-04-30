import { Logger } from '@adonisjs/core/logger'
import { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ContextualLoggerContract } from '#contracts/contextual_logger'
import { ContextualLogger } from '#services/contextual_logger'

/**
 * The container bindings middleware binds classes to their request
 * specific value using the container resolver.
 *
 * - We bind "HttpContext" class to the "ctx" object
 * - We bind "Logger" class to the "ctx.logger" object
 * - We bind "ContextualLoggerContract" to a ContextualLogger with request context
 */
export default class ContainerBindingsMiddleware {
  handle(ctx: HttpContext, next: NextFn) {
    ctx.containerResolver.bindValue(HttpContext, ctx)
    ctx.containerResolver.bindValue(Logger, ctx.logger)

    // Create ContextualLogger with request context (correlationId, workspaceId set by RequestContextMiddleware)
    // userId will be added after auth middleware runs
    const contextualLogger = new ContextualLogger(ctx.logger, {
      correlationId: ctx.correlationId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    })
    ctx.containerResolver.bindValue(ContextualLoggerContract, contextualLogger)

    return next()
  }
}
