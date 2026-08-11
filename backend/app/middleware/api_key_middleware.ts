import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * API Key middleware is used to authenticate requests from external services
 * like the Yjs server using a shared secret key.
 */
export default class ApiKeyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const authHeader = ctx.request.header('Authorization')
    const expectedSecret = env.get('API_SECRET')

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return ctx.response.unauthorized({ error: 'Invalid API key' })
    }

    return next()
  }
}
