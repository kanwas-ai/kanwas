import { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { randomUUID } from 'node:crypto'
import { extractWorkspaceId } from '#contracts/log_context'

/**
 * Request context middleware adds correlation ID and request-scoped context.
 *
 * - Generates a correlation ID (or extracts from x-correlation-id header)
 * - Extracts workspaceId from route params or request body
 * - Creates a child logger with correlationId, method, path, and workspaceId bindings
 * - Stores correlationId and workspaceId on ctx for downstream access
 * - Sets x-correlation-id response header for tracing
 *
 * Note: userId is added after auth middleware runs (in container_bindings_middleware)
 */
export default class RequestContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response, logger } = ctx

    // Generate or extract correlation ID
    const correlationId = request.header('x-correlation-id') || randomUUID()

    // Extract workspaceId from params or body
    const workspaceId = extractWorkspaceId(request.params(), request.body())

    // Build logger bindings
    const bindings: Record<string, unknown> = {
      correlationId,
      method: request.method(),
      path: request.url(true), // Include query string
    }

    if (workspaceId) {
      bindings.workspaceId = workspaceId
    }

    // Create child logger with request context
    ctx.logger = logger.child(bindings)

    // Store context on ctx for downstream access (ContextualLogger, events, etc.)
    ctx.correlationId = correlationId
    ctx.workspaceId = workspaceId

    // Set correlation ID on response for tracing
    response.header('x-correlation-id', correlationId)

    return next()
  }
}
