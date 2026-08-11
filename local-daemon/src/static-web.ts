import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'

/**
 * Serves the production frontend bundle (`vite build --mode kanwasup`) straight
 * from the daemon's own HTTP origin, so the app runs same-origin with the REST
 * API and — crucially — localStorage lives on the daemon's origin. That lets
 * `/local-login` seed the auth token with no devtools/console step (papercut #1).
 *
 * Routes owned here:
 *   GET /               → 302 /local-login   (bare origin always lands somewhere sane)
 *   GET /local-login    → tiny HTML that sets localStorage[tokenKey] then redirects into the canvas
 *   GET /app, /app/*    → static assets from web-dist, SPA-fallback to index.html for client routes
 *
 * The frontend is built with base `/app/`, so index.html references its assets as
 * absolute `/app/assets/*` — those map 1:1 to `web-dist/assets/*`.
 */

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
}

export interface StaticWebOptions {
  /** Absolute path to the built bundle (contains index.html + assets/). */
  webRoot: string
  /** localStorage key the frontend reads the token from (VITE_AUTH_TOKEN_KEY). */
  tokenKey: string
  /** Any non-empty string — `/auth/me` accepts any bearer in local mode. */
  tokenValue: string
  /**
   * Resolves the workspace path (`/app/w/<urlId>`) `/local-login` redirects to
   * when the request has no `?to=` override. Called PER-REQUEST (not baked in
   * at boot) — Phase 2's active vault can change at runtime (POST /vaults,
   * DELETE /vaults/:id), and a stale boot-time value would send `/local-login`
   * to a vault that's no longer the active (or even mounted) one.
   */
  getDefaultWorkspacePath(): string
  logger: Logger
}

export interface StaticWeb {
  /** True if `web-dist/index.html` exists (bundle was built). */
  readonly hasBuild: boolean
  /** Handle a request if it's one of ours; returns true when it did. */
  handle(req: IncomingMessage, res: ServerResponse, pathname: string): boolean
}

export function createStaticWeb(options: StaticWebOptions): StaticWeb {
  const { webRoot, tokenKey, tokenValue, getDefaultWorkspacePath } = options
  const log = options.logger.child({ component: 'StaticWeb' })
  const indexHtmlPath = path.join(webRoot, 'index.html')

  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { 'Content-Type': type })
    res.end(body)
  }

  const serveFile = (res: ServerResponse, filePath: string, method: string): void => {
    const ext = path.extname(filePath).toLowerCase()
    const type = STATIC_MIME[ext] ?? 'application/octet-stream'
    // Hashed assets are immutable; index.html must always re-validate.
    const cacheControl = /\/assets\//.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl })
    if (method === 'HEAD') return void res.end()
    fs.createReadStream(filePath).pipe(res)
  }

  const serveIndex = (res: ServerResponse, method: string): void => {
    serveFile(res, indexHtmlPath, method)
  }

  return {
    get hasBuild() {
      return fs.existsSync(indexHtmlPath)
    },

    handle(req, res, pathname): boolean {
      const method = req.method ?? 'GET'

      if (pathname === '/' && (method === 'GET' || method === 'HEAD')) {
        res.writeHead(302, { Location: '/local-login' })
        res.end()
        return true
      }

      if (pathname === '/local-login' && (method === 'GET' || method === 'HEAD')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        // Rendered fresh per-request (it's tiny) so a `?to=`-less login always
        // targets the CURRENT active vault, not whatever was active at boot.
        res.end(method === 'HEAD' ? undefined : renderLoginPage(tokenKey, tokenValue, getDefaultWorkspacePath()))
        return true
      }

      if (pathname === '/app' || pathname.startsWith('/app/')) {
        if (method !== 'GET' && method !== 'HEAD') {
          send(res, 405, 'text/plain', 'method not allowed')
          return true
        }
        if (!this.hasBuild) {
          send(
            res,
            503,
            'text/plain; charset=utf-8',
            'Kanwas web bundle is not built yet. Run `kanwas up` (it builds on first use) or `vite build --mode kanwasup`.'
          )
          return true
        }

        // Strip the `/app` base to get a path relative to web-dist.
        const rel = pathname.replace(/^\/app\/?/, '')
        if (rel === '') return (void serveIndex(res, method), true)

        const abs = path.resolve(webRoot, rel)
        if (abs !== webRoot && !abs.startsWith(webRoot + path.sep)) {
          send(res, 403, 'text/plain', 'forbidden')
          return true
        }
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          serveFile(res, abs, method)
          return true
        }
        // Unknown path under /app → a client-side route: hand back the SPA shell.
        log.debug({ pathname }, 'SPA fallback → index.html')
        serveIndex(res, method)
        return true
      }

      return false
    },
  }
}

/**
 * The zero-console login shim. Sets `localStorage[tokenKey]` on the daemon's own
 * origin (same origin the app runs on) and redirects into the workspace canvas.
 * `?token=` / `?to=` query params can override the defaults but are not required.
 */
function renderLoginPage(tokenKey: string, tokenValue: string, workspacePath: string): string {
  const KEY = JSON.stringify(tokenKey)
  const VAL = JSON.stringify(tokenValue)
  const DEST = JSON.stringify(workspacePath)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Opening Kanwas…</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:#555;background:#faf9f7}
  .msg{font-size:15px;letter-spacing:.2px}
</style>
</head>
<body>
<div class="msg">Opening your Kanwas workspace…</div>
<script>
(function(){
  try {
    var params = new URLSearchParams(location.search);
    var key = ${KEY};
    var val = params.get('token') || ${VAL};
    var to = params.get('to');
    var dest = (to && to.charAt(0) === '/') ? to : ${DEST};
    localStorage.setItem(key, val);
    location.replace(dest);
  } catch (e) {
    document.querySelector('.msg').textContent =
      'Could not open automatically — go to /app to continue.';
  }
})();
</script>
</body>
</html>
`
}
