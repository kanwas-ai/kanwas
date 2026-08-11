import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 *
 * Tokens minted with the wildcard ability (`*`) have full user scope and
 * can access any authenticated route. Tokens minted with restricted
 * abilities (e.g. `workspace:<id>:sandbox` for sandboxes) are rejected by
 * default and only accepted on routes that explicitly opt in via
 * `allowSandboxToken`.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
      allowSandboxToken?: boolean
    } = {}
  ) {
    await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })

    const token = ctx.auth.user?.currentAccessToken
    if (token && !token.allows('*') && !options.allowSandboxToken) {
      return ctx.response.forbidden({
        error: 'Scoped token cannot access this endpoint',
      })
    }

    return next()
  }
}
