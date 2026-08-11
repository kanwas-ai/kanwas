import { HttpContext } from '@adonisjs/core/http'
import AdminAuthMiddleware, {
  verifyAdminToken,
  isAdminConfigured,
  getAdminPath,
} from '../middleware/admin_auth_middleware.js'

export default class AdminAuthController {
  async showLogin({ response }: HttpContext) {
    if (!isAdminConfigured()) {
      return response.notFound('Not found')
    }

    const adminPath = getAdminPath()
    return response.header('content-type', 'text/html').send(loginPageHtml(adminPath))
  }

  async login(ctx: HttpContext) {
    const adminPath = getAdminPath()
    const token = ctx.request.input('token', '').trim()

    if (!token || !verifyAdminToken(token)) {
      return ctx.response.header('content-type', 'text/html').send(loginPageHtml(adminPath, 'Invalid token'))
    }

    AdminAuthMiddleware.setSessionCookie(ctx)
    return ctx.response.redirect(`/${adminPath}`)
  }

  async logout(ctx: HttpContext) {
    const adminPath = getAdminPath()
    AdminAuthMiddleware.clearSessionCookie(ctx)
    return ctx.response.redirect(`/${adminPath}/login`)
  }
}

function loginPageHtml(adminPath: string, error?: string): string {
  const errorBlock = error
    ? `<div style="color:#ef4444;margin-bottom:12px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;font-size:13px">${escapeHtml(error)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1f1f1f;
      color: #c6c5c5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #2b2b2b;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 32px;
      width: 100%;
      max-width: 360px;
    }
    .logo {
      margin-bottom: 24px;
      text-align: center;
    }
    .logo img {
      height: 28px;
      filter: invert(1);
      opacity: 0.9;
    }
    label {
      display: block;
      font-size: 13px;
      color: rgba(198, 197, 197, 0.7);
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 8px 12px;
      background: #1f1f1f;
      border: 1px solid #333;
      border-radius: 6px;
      color: #c6c5c5;
      font-size: 14px;
      font-family: monospace;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #e8a300; }
    button {
      width: 100%;
      padding: 10px;
      background: linear-gradient(180deg, #4a4a4a, #353535);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 2px rgba(0, 0, 0, 0.15);
    }
    button:hover { background: linear-gradient(180deg, #555, #404040); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><img src="/${escapeHtml(adminPath)}/logo.png" alt=""></div>
    ${errorBlock}
    <form method="POST" action="/${escapeHtml(adminPath)}/login">
      <label for="token">Token</label>
      <input type="password" id="token" name="token" autocomplete="off" required autofocus>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
