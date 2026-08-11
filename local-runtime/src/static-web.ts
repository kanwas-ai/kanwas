import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from 'pino'
import { isPathInside } from './path-security.js'

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
  webRoot: string
  logger: Logger
}

export interface StaticWeb {
  readonly hasBuild: boolean
  handle(req: IncomingMessage, res: ServerResponse, pathname: string): boolean
}

/** Serve the prebuilt Electron renderer. There is deliberately no login shim. */
export function createStaticWeb(options: StaticWebOptions): StaticWeb {
  const { webRoot } = options
  const log = options.logger.child({ component: 'StaticWeb' })
  const indexHtmlPath = path.join(webRoot, 'index.html')

  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { 'Content-Type': type })
    res.end(body)
  }

  const serveFile = (res: ServerResponse, filePath: string, method: string): void => {
    const ext = path.extname(filePath).toLowerCase()
    const type = STATIC_MIME[ext] ?? 'application/octet-stream'
    const cacheControl = /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheControl })
    if (method === 'HEAD') return void res.end()
    fs.createReadStream(filePath).pipe(res)
  }

  return {
    get hasBuild() {
      return fs.existsSync(indexHtmlPath)
    },

    handle(req, res, pathname): boolean {
      const method = req.method ?? 'GET'
      if (pathname === '/' && (method === 'GET' || method === 'HEAD')) {
        res.writeHead(302, { Location: '/app' })
        res.end()
        return true
      }
      if (pathname !== '/app' && !pathname.startsWith('/app/')) return false
      if (method !== 'GET' && method !== 'HEAD') {
        send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
        return true
      }
      if (!this.hasBuild) {
        send(res, 503, 'text/plain; charset=utf-8', 'Kanwas renderer bundle is missing. Build renderer first.')
        return true
      }

      const rel = pathname.replace(/^\/app\/?/, '')
      if (rel === '') {
        serveFile(res, indexHtmlPath, method)
        return true
      }
      const abs = path.resolve(webRoot, rel)
      if (!isPathInside(webRoot, abs)) {
        send(res, 403, 'text/plain; charset=utf-8', 'forbidden')
        return true
      }
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        serveFile(res, abs, method)
        return true
      }
      log.debug({ pathname }, 'SPA fallback to renderer index')
      serveFile(res, indexHtmlPath, method)
      return true
    },
  }
}
