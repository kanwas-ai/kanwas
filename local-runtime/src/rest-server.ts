import fs from 'node:fs'
import { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import path from 'node:path'
import type { Logger } from 'pino'
import { sanitizeFilename } from 'shared/constants'
import { WebSocketServer } from 'ws'
import { fetchLinkMetadata } from './link-metadata.js'
import { mintSocketToken } from './identity.js'
import type { Mount } from './mount.js'
import type { MountManager } from './mount-manager.js'
import { parseBoundary, parseMultipart, readRequestBody } from './multipart.js'
import { resolveExistingPathInside } from './path-security.js'
import { SsrfError } from './ssrf-guard.js'
import { createStaticWeb } from './static-web.js'
import { detectAgents, isAgentId } from './terminal/agents.js'
import { createMcpHandler } from './terminal/mcp-server.js'
import { isValidTerminalSize, type TerminalSessionManager } from './terminal/session-manager.js'
import {
  emptyEnrichedContext,
  enrichContext,
  parseUiContextInput,
  resolveRef,
  UiContextStore,
} from './terminal/ui-context.js'
import { mimeTypeForUpload } from './upload.js'
import { findMountByIdOrUrlId } from './workspace-resolution.js'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_JSON_BODY_BYTES = 64 * 1024
const MAX_NOTE_BODY_BYTES = 8 * 1024 * 1024
const YJS_SOCKET_PATH = '/yjs/socket.io'

function isYjsSocketPath(pathname: string): boolean {
  return pathname === YJS_SOCKET_PATH || pathname.startsWith(`${YJS_SOCKET_PATH}/`)
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

export interface RuntimeRoomManager {
  flushWorkspace(workspaceId: string): Promise<void>
}

export interface RestServerOptions {
  server: Server
  origin: string
  mountManager: MountManager
  roomManager: RuntimeRoomManager
  secret: string
  logger: Logger
  rendererDir: string
  terminalManager: TerminalSessionManager
  getWorkspaceName(workspaceId: string): string
}

export interface RunningRestServer {
  close(): Promise<void>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function resolveInsideFolder(folder: string, relPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(relPath).replace(/^[/\\]+/, '')
  } catch {
    return null
  }
  return resolveExistingPathInside(folder, decoded)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJsonBody(
  req: IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const { body, truncated } = await readRequestBody(req, maxBytes)
  if (truncated) return { ok: false }
  if (body.length === 0) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(body.toString('utf-8')) }
  } catch {
    return { ok: false }
  }
}

function isKnownApiPath(pathname: string): boolean {
  return [
    /^\/api\/workspaces$/,
    /^\/api\/workspaces\/[^/]+$/,
    /^\/api\/workspaces\/[^/]+\/yjs-token$/,
    /^\/api\/workspaces\/[^/]+\/files$/,
    /^\/api\/workspaces\/[^/]+\/notes\/[^/]+\/content$/,
    /^\/api\/workspaces\/[^/]+\/flush$/,
    /^\/api\/workspaces\/[^/]+\/link-metadata$/,
    /^\/api\/terminal\/agents$/,
    /^\/api\/workspaces\/[^/]+\/terminal-sessions(?:\/[^/]+)?$/,
    /^\/api\/workspaces\/[^/]+\/ui-context$/,
    /^\/api\/workspaces\/[^/]+\/resolve-context$/,
    /^\/api\/files\/raw$/,
  ].some((pattern) => pattern.test(pathname))
}

export function attachRestServer(options: RestServerOptions): RunningRestServer {
  const { server, origin, mountManager, roomManager, secret, rendererDir, terminalManager } = options
  const log = options.logger.child({ component: 'LocalApi' })
  const allowedHost = new URL(origin).host
  const staticWeb = createStaticWeb({ webRoot: rendererDir, logger: options.logger })
  const uiContextStore = new UiContextStore()
  const mcpHandler = createMcpHandler({ mountManager, uiContextStore, logger: options.logger })

  const isCrossOriginBrowserRequest = (req: IncomingMessage): boolean => {
    const requestOrigin = req.headers.origin
    const fetchSite = req.headers['sec-fetch-site']
    return Boolean(
      (requestOrigin && requestOrigin !== origin) || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')
    )
  }

  const runAsync = (res: ServerResponse, operation: () => Promise<void>, message: string): void => {
    void operation().catch((error) => {
      log.error({ error: String(error) }, message)
      if (!res.headersSent && !res.destroyed && !res.writableEnded) {
        sendJson(res, 500, { error: 'Internal runtime error' })
      }
    })
  }

  const findMount = (id: string): Mount | undefined => findMountByIdOrUrlId(mountManager.list(), id)
  const workspaceJson = (mount: Mount) => ({
    id: mount.workspaceId,
    urlId: mount.workspaceUrlId,
    name: options.getWorkspaceName(mount.workspaceId),
    path: mount.folder,
  })

  const handleUpload = async (mount: Mount, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const boundary = parseBoundary(req.headers['content-type'])
    if (!boundary) return sendJson(res, 400, { error: 'Expected multipart/form-data' })
    const { body, truncated } = await readRequestBody(req, MAX_UPLOAD_BYTES)
    if (truncated) return sendJson(res, 413, { error: 'Upload exceeds the size limit' })
    const parsed = parseMultipart(body, boundary)
    const filePart = parsed?.files.find((file) => file.field === 'file') ?? parsed?.files[0]
    if (!parsed || !filePart) return sendJson(res, 400, { error: 'No file part in upload' })
    const canvasId = parsed.fields.canvas_id ?? ''
    const suppliedName = parsed.fields.filename || filePart.filename || 'file'
    const fileName = sanitizeFilename(suppliedName.split(/[/\\]/).pop() || 'file')
    try {
      const uploaded = await mount.handleUpload({
        canvasId,
        filename: fileName,
        buffer: filePart.data,
        mimeType: mimeTypeForUpload(fileName, filePart.contentType),
      })
      return sendJson(res, 200, { ...uploaded, fileName: uploaded.filename })
    } catch (error) {
      log.error({ workspaceId: mount.workspaceId, error: String(error) }, 'File upload failed')
      return sendJson(res, 500, { error: 'Upload failed' })
    }
  }

  const requestListener = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', origin)
    const pathname = url.pathname
    const method = req.method ?? 'GET'

    if (req.headers.host !== allowedHost) {
      return sendJson(res, 403, { error: 'Unexpected request host' })
    }

    // Socket.IO owns this path on the same HTTP server.
    if (isYjsSocketPath(pathname)) return
    if (pathname === '/mcp') {
      if (isCrossOriginBrowserRequest(req)) return sendJson(res, 403, { error: 'Cross-origin request rejected' })
      if (mcpHandler.handle(req, res, pathname)) return
    }
    if (staticWeb.handle(req, res, pathname)) return

    if (!pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' })
    }
    if (isCrossOriginBrowserRequest(req)) {
      return sendJson(res, 403, { error: 'Cross-origin request rejected' })
    }

    if (pathname === '/api/workspaces' && method === 'GET') {
      return sendJson(res, 200, mountManager.list().map(workspaceJson))
    }

    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/)
    if (workspaceMatch && method === 'GET') {
      const mount = findMount(workspaceMatch[1])
      return mount ? sendJson(res, 200, workspaceJson(mount)) : sendJson(res, 404, { error: 'Unknown workspace' })
    }

    const tokenMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/yjs-token$/)
    if (tokenMatch && method === 'POST') {
      const mount = findMount(tokenMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      return sendJson(res, 200, { ...mintSocketToken(secret, mount.workspaceId), socketPath: YJS_SOCKET_PATH })
    }

    const uploadMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/files$/)
    if (uploadMatch && method === 'POST') {
      const mount = findMount(uploadMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      runAsync(res, () => handleUpload(mount, req, res), 'Upload request failed')
      return
    }

    const noteMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/notes\/([^/]+)\/content$/)
    if (noteMatch && method === 'GET') {
      const mount = findMount(noteMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      runAsync(
        res,
        async () => {
          const result = await mount.orchestrator.handleNoteBaseline(noteMatch[2])
          return result.status === 200
            ? sendJson(res, 200, { hash: result.hash, relPath: result.relPath })
            : sendJson(res, result.status, { error: result.error })
        },
        'Note baseline request failed'
      )
      return
    }
    if (noteMatch && method === 'PUT') {
      const mount = findMount(noteMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        const parsed = await readJsonBody(req, MAX_NOTE_BODY_BYTES)
        if (!parsed.ok || !isObject(parsed.value) || typeof parsed.value.body !== 'string') {
          return sendJson(res, 400, { error: 'body is required' })
        }
        const result = await mount.orchestrator.handleNoteSave({
          nodeId: noteMatch[2],
          body: parsed.value.body,
          baseHash:
            typeof parsed.value.baseHash === 'string' || parsed.value.baseHash === null
              ? parsed.value.baseHash
              : undefined,
          force: parsed.value.force === true,
        })
        if (result.status === 200) return sendJson(res, 200, { hash: result.hash, relPath: result.relPath })
        if (result.status === 409) return sendJson(res, 409, { diskHash: result.diskHash })
        return sendJson(res, result.status, { error: result.error })
      })().catch((error) => {
        log.error({ error: String(error), nodeId: noteMatch[2] }, 'Note save failed')
        if (!res.headersSent) sendJson(res, 500, { error: 'Note save failed' })
      })
      return
    }

    const flushMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/flush$/)
    if (flushMatch && method === 'POST') {
      const mount = findMount(flushMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void Promise.all([roomManager.flushWorkspace(mount.workspaceId), mount.orchestrator.flusher.flushNow()])
        .then(() => sendJson(res, 200, { flushed: true }))
        .catch((error) => {
          log.error({ error: String(error), workspaceId: mount.workspaceId }, 'Flush failed')
          sendJson(res, 500, { error: 'Flush failed' })
        })
      return
    }

    const metadataMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/link-metadata$/)
    if (metadataMatch && method === 'POST') {
      const mount = findMount(metadataMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        const parsed = await readJsonBody(req)
        if (!parsed.ok || !isObject(parsed.value) || typeof parsed.value.url !== 'string') {
          return sendJson(res, 400, { error: 'url is required' })
        }
        if (typeof parsed.value.canvasId !== 'string' || parsed.value.canvasId.length === 0) {
          return sendJson(res, 400, { error: 'canvasId is required' })
        }
        const result = await fetchLinkMetadata({
          url: parsed.value.url,
          canvasId: parsed.value.canvasId,
          upload: mount.handleUpload,
          logger: options.logger,
        })
        return sendJson(res, 200, result)
      })().catch((error) => {
        const message = error instanceof SsrfError ? error.message : 'Failed to fetch metadata'
        log.warn({ error: String(error) }, 'Link metadata request failed')
        if (!res.headersSent) sendJson(res, 400, { error: message })
      })
      return
    }

    if (pathname === '/api/terminal/agents' && method === 'GET') {
      runAsync(res, async () => sendJson(res, 200, { agents: await detectAgents() }), 'Terminal agent discovery failed')
      return
    }

    const sessionsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/terminal-sessions$/)
    if (sessionsMatch && method === 'GET') {
      const mount = findMount(sessionsMatch[1])
      return mount
        ? sendJson(res, 200, { sessions: terminalManager.list(mount.workspaceId) })
        : sendJson(res, 404, { error: 'Unknown workspace' })
    }
    if (sessionsMatch && method === 'POST') {
      const mount = findMount(sessionsMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      runAsync(
        res,
        async () => {
          const parsed = await readJsonBody(req)
          if (!parsed.ok || !isObject(parsed.value) || typeof parsed.value.agent !== 'string') {
            return sendJson(res, 400, { error: 'agent is required' })
          }
          if (!isAgentId(parsed.value.agent)) return sendJson(res, 400, { error: 'Unknown agent' })
          const agentId = parsed.value.agent
          const available = (await detectAgents()).find((agent) => agent.id === agentId)?.available
          if (!available) return sendJson(res, 400, { error: `Agent "${agentId}" is not available` })
          const cols = parsed.value.cols === undefined ? 80 : parsed.value.cols
          const rows = parsed.value.rows === undefined ? 24 : parsed.value.rows
          if (typeof cols !== 'number' || typeof rows !== 'number' || !isValidTerminalSize(cols, rows)) {
            return sendJson(res, 400, { error: 'Terminal dimensions are out of range' })
          }
          return sendJson(
            res,
            200,
            terminalManager.createSession({
              workspaceId: mount.workspaceId,
              folder: mount.folder,
              agent: agentId,
              cols,
              rows,
              theme: parsed.value.theme === 'light' || parsed.value.theme === 'dark' ? parsed.value.theme : undefined,
            })
          )
        },
        'Terminal session creation failed'
      )
      return
    }

    const sessionMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/terminal-sessions\/([^/]+)$/)
    if (sessionMatch && method === 'DELETE') {
      const mount = findMount(sessionMatch[1])
      if (!mount || !terminalManager.belongsTo(sessionMatch[2], mount.workspaceId)) {
        return sendJson(res, 404, { error: 'Unknown terminal session' })
      }
      terminalManager.remove(sessionMatch[2])
      res.writeHead(204)
      res.end()
      return
    }

    const contextMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/ui-context$/)
    if (contextMatch && method === 'GET') {
      const mount = findMount(contextMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      const stored = uiContextStore.get(mount.workspaceId)
      return sendJson(res, 200, stored ? enrichContext(mount, stored.input, stored.updatedAt) : emptyEnrichedContext())
    }
    if (contextMatch && method === 'POST') {
      const mount = findMount(contextMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      runAsync(
        res,
        async () => {
          const parsed = await readJsonBody(req)
          if (!parsed.ok) return sendJson(res, 400, { error: 'Expected a JSON body' })
          uiContextStore.set(mount.workspaceId, parseUiContextInput(parsed.value))
          res.writeHead(204)
          res.end()
        },
        'UI context update failed'
      )
      return
    }

    const resolveMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/resolve-context$/)
    if (resolveMatch && method === 'POST') {
      const mount = findMount(resolveMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      runAsync(
        res,
        async () => {
          const parsed = await readJsonBody(req)
          if (!parsed.ok || !isObject(parsed.value) || typeof parsed.value.nodeId !== 'string') {
            return sendJson(res, 400, { error: 'nodeId is required' })
          }
          const resolved = resolveRef(
            mount,
            parsed.value.nodeId,
            typeof parsed.value.text === 'string' ? parsed.value.text : undefined
          )
          return resolved
            ? sendJson(res, 200, resolved)
            : sendJson(res, 404, { error: 'Could not resolve nodeId to a file on disk' })
        },
        'UI context resolution failed'
      )
      return
    }

    if (pathname === '/api/files/raw' && (method === 'GET' || method === 'HEAD')) {
      const mount = findMount(url.searchParams.get('workspaceId') ?? '')
      const relativePath = url.searchParams.get('path') ?? ''
      const absolute = mount ? resolveInsideFolder(mount.folder, relativePath) : null
      if (!absolute) {
        return sendJson(res, 404, { error: 'File not found' })
      }
      runAsync(
        res,
        async () => {
          const flags = fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW)
          let file: Awaited<ReturnType<typeof fs.promises.open>> | undefined
          try {
            file = await fs.promises.open(absolute, flags)
            const stat = await file.stat()
            if (!stat.isFile()) {
              await file.close()
              return sendJson(res, 404, { error: 'File not found' })
            }
            const headers: Record<string, string> = {
              'Content-Type': MIME[path.extname(absolute).toLowerCase()] ?? 'application/octet-stream',
              'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
              'X-Content-Type-Options': 'nosniff',
            }
            if (url.searchParams.get('download') === '1') {
              const requested = url.searchParams.get('filename') ?? path.basename(absolute)
              const basename = requested.split(/[/\\]/).pop() || path.basename(absolute)
              headers['Content-Disposition'] = `attachment; filename="${basename.replace(/["\r\n]/g, '_')}"`
            }
            res.writeHead(200, headers)
            if (method === 'HEAD') {
              await file.close()
              res.end()
              return
            }
            const stream = file.createReadStream({ autoClose: true })
            stream.on('error', (error) => {
              log.warn({ error: String(error), absolute }, 'Raw file stream failed')
              if (!res.destroyed) res.destroy(error)
            })
            stream.pipe(res)
          } catch (error) {
            await file?.close().catch(() => undefined)
            if (!res.headersSent && !res.destroyed) sendJson(res, 404, { error: 'File not found' })
          }
        },
        'Raw file request failed'
      )
      return
    }

    return isKnownApiPath(pathname)
      ? sendJson(res, 405, { error: 'Method not allowed' })
      : sendJson(res, 404, { error: 'Not found' })
  }

  const terminalWss = new WebSocketServer({ noServer: true })
  const upgradeListener = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? '/', origin)
    if (isYjsSocketPath(url.pathname)) return
    if (req.headers.host !== allowedHost) return void socket.destroy()
    const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/terminal-sessions\/([^/]+)\/attach$/)
    if (!match) return void socket.destroy()
    if (req.headers.origin && req.headers.origin !== origin) return void socket.destroy()
    const mount = findMount(match[1])
    if (!mount || !terminalManager.belongsTo(match[2], mount.workspaceId)) return void socket.destroy()
    terminalWss.handleUpgrade(req, socket, head, (webSocket) => terminalManager.attach(match[2], webSocket))
  }

  server.on('request', requestListener)
  server.on('upgrade', upgradeListener)

  return {
    async close() {
      server.off('request', requestListener)
      server.off('upgrade', upgradeListener)
      for (const client of terminalWss.clients) client.terminate()
      await new Promise<void>((resolve) => terminalWss.close(() => resolve()))
    },
  }
}
