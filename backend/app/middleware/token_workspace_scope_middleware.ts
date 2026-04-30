import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Enforces that a scoped access token (abilities other than `*`) is bound to
 * the workspace resolved by the preceding `organizationAccess` middleware.
 *
 * Wildcard tokens pass through untouched. Scoped sandbox tokens must carry
 * the `workspace:<id>:sandbox` ability matching `ctx.workspaceId`, otherwise
 * the request is rejected with 403.
 *
 * Must run AFTER `organizationAccess`, which populates `ctx.workspaceId`.
 */
export default class TokenWorkspaceScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const token = ctx.auth.user?.currentAccessToken
    if (!token || token.allows('*')) {
      return next()
    }

    const workspaceId = ctx.workspaceId
    if (!workspaceId) {
      return ctx.response.forbidden({ error: 'Scoped token missing workspace context' })
    }

    if (!token.allows(`workspace:${workspaceId}:sandbox`)) {
      return ctx.response.forbidden({ error: 'Token not scoped to this workspace' })
    }

    return next()
  }
}
