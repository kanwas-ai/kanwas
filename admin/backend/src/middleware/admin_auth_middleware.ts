import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { createHash, timingSafeEqual } from 'node:crypto'
import env from 'backend/env'

const COOKIE_NAME = 'kanwas_admin_session'
const COOKIE_MAX_AGE = '7d'

const DEFAULT_ADMIN_PATH = 'admin-dev'

export function getAdminPath(): string {
  return env.get('ADMIN_PATH') ?? DEFAULT_ADMIN_PATH
}

function getAdminToken(): string {
  return env.get('ADMIN_TOKEN') ?? ''
}

/**
 * Verify admin token (constant-time comparison).
 * Hashes both sides so the comparison doesn't leak expected-token length.
 */
export function verifyAdminToken(token: string): boolean {
  const expected = getAdminToken()
  if (!expected || !token) return false
  const tokenHash = createHash('sha256').update(token).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(tokenHash, expectedHash)
}

export function isAdminConfigured(): boolean {
  return getAdminToken().length > 0
}

export default class AdminAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!isAdminConfigured()) {
      return ctx.response.notFound('Not found')
    }

    const adminPath = getAdminPath()
    const cookieValue = ctx.request.encryptedCookie(COOKIE_NAME)
    if (cookieValue !== 'authenticated') {
      const url = ctx.request.url()
      const isApiOrAsset = url.startsWith(`/${adminPath}/api/`) || url.includes('/assets/')
      if (isApiOrAsset) {
        return ctx.response.unauthorized({ error: 'Admin authentication required' })
      }
      return ctx.response.redirect(`/${adminPath}/login`)
    }

    return next()
  }

  static setSessionCookie(ctx: HttpContext) {
    const adminPath = getAdminPath()
    ctx.response.encryptedCookie(COOKIE_NAME, 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: `/${adminPath}`,
    })
  }

  static clearSessionCookie(ctx: HttpContext) {
    const adminPath = getAdminPath()
    ctx.response.clearCookie(COOKIE_NAME, { path: `/${adminPath}` })
  }
}
