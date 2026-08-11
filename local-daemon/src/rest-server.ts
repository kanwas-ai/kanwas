import { once } from 'node:events'
import fs from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { Logger } from 'pino'
import { WebSocketServer } from 'ws'
import type { RunningYjsServer } from 'kanwas-yjs-server/server'
import { LOCAL_AUTH_TOKEN_VALUE, LOCAL_ORG, LOCAL_USER, mintSocketToken } from './identity.js'
import type { Mount } from './mount.js'
import type { MountManager } from './mount-manager.js'
import { parseBoundary, parseMultipart, readRequestBody } from './multipart.js'
import { createSocketIoStub } from './socketio-stub.js'
import { createStaticWeb } from './static-web.js'
import { detectAgents, isAgentId } from './terminal/agents.js'
import { createMcpHandler } from './terminal/mcp-server.js'
import type { TerminalSessionManager } from './terminal/session-manager.js'
import {
  emptyEnrichedContext,
  enrichContext,
  parseUiContextInput,
  resolveRef,
  UiContextStore,
} from './terminal/ui-context.js'
import { mimeTypeForUpload } from './upload.js'
import { byRecency, loadRegistry, registerVault, saveRegistry, touchVault, unregisterVault } from './vaults.js'
import { findMountByIdOrUrlId, resolveFilesWorkspace, type ResolvableMount } from './workspace-resolution.js'

/** 25 MB ceiling for an upload body (frontend caps individual files at 5 MB). */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
/** Plenty for a `{ path, label? }` vault-management JSON body. */
const MAX_JSON_BODY_BYTES = 64 * 1024
/** A note body is markdown/YAML text, not a file upload, but can run well past MAX_JSON_BODY_BYTES. */
const MAX_NOTE_BODY_BYTES = 8 * 1024 * 1024

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

export interface RestServerOptions {
  /** Owns every live per-folder mount; the REST surface is a thin view over it. */
  mountManager: MountManager
  /** The embedded Yjs core's room manager — used by POST /workspaces/:id/flush. */
  roomManager: RunningYjsServer['roomManager']
  /** Where the persistent vault registry lives (`~/.kanwas/vaults.json`, or the `KANWAS_HOME` test override). */
  registryFile: string
  secret: string
  host: string
  port: number
  logger: Logger
  /** Built frontend bundle to serve under `/app/` (vite `--mode kanwasup` output). */
  webDist: string
  /** localStorage key the `/local-login` page writes the token to. */
  tokenKey: string
  /** Embedded PTY terminal sessions (WP-D) — owned by index.ts so it can disposeAll() on shutdown. */
  terminalManager: TerminalSessionManager
}

export interface RunningRestServer {
  server: Server
  baseUrl: string
  close(): Promise<void>
}

export async function startRestServer(options: RestServerOptions): Promise<RunningRestServer> {
  const { mountManager, roomManager, registryFile, secret, host, port, webDist, tokenKey, terminalManager } = options
  const log = options.logger.child({ component: 'RestServer' })
  const now = new Date().toISOString()
  const baseUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

  // Runtime vault-registry state. Loaded once here (picking up whatever
  // index.ts already mounted/saved at boot); from then on this is the ONLY
  // place that mutates it — the vault-management routes below (POST/DELETE
  // /vaults) update it in-process and persist after every mutation. index.ts
  // owns BOOT-time mounting only.
  let registry = loadRegistry(registryFile, options.logger)
  const getActiveWorkspaceId = (): string | undefined => registry.activeWorkspaceId

  // Same-origin frontend bundle + zero-console token login + `/` redirect.
  const staticWeb = createStaticWeb({
    webRoot: webDist,
    tokenKey,
    tokenValue: LOCAL_AUTH_TOKEN_VALUE,
    getDefaultWorkspacePath: () => {
      const activeId = getActiveWorkspaceId()
      const active = (activeId && mountManager.get(activeId)) || mountManager.list()[0]
      return active ? `/app/w/${active.workspaceUrlId}` : '/app'
    },
    logger: options.logger,
  })
  // Quiets the stock frontend's dead app-channel socket (papercut #2).
  const socketIoStub = createSocketIoStub(options.logger)

  // In-memory UI-context store (WP-C) — no persistence, no file writes; see
  // terminal/ui-context.ts. Backs both the /ui-context routes below and the
  // MCP `kanwas_get_ui_context` pull tool.
  const uiContextStore = new UiContextStore()
  const mcpHandler = createMcpHandler({ mountManager, uiContextStore, logger: options.logger })

  const organization = { id: LOCAL_ORG.id, name: LOCAL_ORG.name, createdAt: now, updatedAt: now }

  const setCors = (res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,x-correlation-id,x-requested-with')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  /** Resolve a mount by its real workspaceId OR its URL-form id (frontend/CLI may send either). */
  const findMount = (id: string): Mount | undefined => findMountByIdOrUrlId(mountManager.list(), id)

  const labelFor = (workspaceId: string): string | undefined =>
    registry.vaults.find((v) => v.workspaceId === workspaceId)?.label

  const workspaceJson = (mount: Mount) => ({
    id: mount.workspaceId,
    name: labelFor(mount.workspaceId) || path.basename(mount.folder) || 'Local Workspace',
    organizationId: LOCAL_ORG.id,
    onboardingStatus: 'completed',
    isEmbedTemplate: false,
    createdAt: now,
    updatedAt: now,
  })

  const resolvableMounts = (): ResolvableMount[] =>
    mountManager.list().map((m) => ({ workspaceId: m.workspaceId, workspaceUrlId: m.workspaceUrlId, folder: m.folder }))

  // Resolve a workspace-relative storagePath safely under a SPECIFIC mount's
  // folder (per-mount path-traversal guard — a request resolved to workspace A
  // can never read outside A's folder, even accidentally into workspace B's).
  const resolveInsideFolder = (folder: string, relPath: string): string | null => {
    const clean = decodeURIComponent(relPath || '').replace(/^\/+/, '')
    const abs = path.resolve(folder, clean)
    if (abs !== folder && !abs.startsWith(folder + path.sep)) return null
    return abs
  }
  const existsInFolder = (folder: string, relPath: string): boolean => {
    const abs = resolveInsideFolder(folder, relPath)
    return !!abs && fs.existsSync(abs) && fs.statSync(abs).isFile()
  }

  /** The pathname portion of a `Referer` header, or null if absent/unparseable. */
  const refererPathname = (referer: string | string[] | undefined): string | null => {
    const value = Array.isArray(referer) ? referer[0] : referer
    if (!value) return null
    try {
      return new URL(value).pathname
    } catch {
      return null
    }
  }

  /** Expand a leading `~` (home dir); everything else is returned unchanged. */
  const expandHome = (input: string): string => {
    if (input === '~') return os.homedir()
    if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
    return input
  }

  /** Read+parse a JSON body up to `maxBytes` (default: the small vault-management ceiling). `ok: false` on truncation or invalid JSON. */
  const readJsonBody = async (
    req: IncomingMessage,
    maxBytes: number = MAX_JSON_BODY_BYTES
  ): Promise<{ ok: true; value: unknown } | { ok: false }> => {
    const { body, truncated } = await readRequestBody(req, maxBytes)
    if (truncated) return { ok: false }
    if (body.length === 0) return { ok: true, value: {} }
    try {
      return { ok: true, value: JSON.parse(body.toString('utf-8')) }
    } catch {
      return { ok: false }
    }
  }

  // Parse a multipart upload and hand it to the target mount's upload handler.
  // The frontend's upload hook posts fields `file` (binary), `canvas_id`,
  // `filename` and reads back `{ storagePath, mimeType, size }`.
  const handleUpload = async (mount: Mount, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const boundary = parseBoundary(req.headers['content-type'])
    if (!boundary) {
      return sendJson(res, 400, { error: 'Expected multipart/form-data' })
    }
    const { body, truncated } = await readRequestBody(req, MAX_UPLOAD_BYTES)
    if (truncated) {
      return sendJson(res, 413, { error: 'Upload exceeds the size limit' })
    }
    const parsed = parseMultipart(body, boundary)
    const filePart = parsed?.files.find((f) => f.field === 'file') ?? parsed?.files[0]
    if (!parsed || !filePart) {
      return sendJson(res, 400, { error: 'No file part in upload' })
    }
    const canvasId = parsed.fields.canvas_id ?? ''
    const filename = (parsed.fields.filename || filePart.filename || 'file').split('/').pop()!
    const mimeType = mimeTypeForUpload(filename, filePart.contentType)
    try {
      const result = await mount.handleUpload({ canvasId, filename, buffer: filePart.data, mimeType })
      log.info(
        { workspaceId: mount.workspaceId, canvasId, storagePath: result.storagePath, size: result.size },
        'Handled file upload'
      )
      return sendJson(res, 200, result)
    } catch (error) {
      log.error({ workspaceId: mount.workspaceId, error: String(error) }, 'File upload failed')
      return sendJson(res, 500, { error: 'Upload failed' })
    }
  }

  // Mount a vault by folder path: realpath it via MountManager, register+touch
  // it in the persistent registry, and hand back enough for a caller (Phase 3
  // CLI, or this same daemon's own boot path) to open it. Never touches folder
  // contents beyond what mounting already does (identity file, empty-seed).
  const mountVault = async (rawPath: string, label: string | undefined, res: ServerResponse): Promise<void> => {
    const expanded = expandHome(rawPath)
    if (!path.isAbsolute(expanded)) {
      return sendJson(res, 400, { error: 'path must be absolute' })
    }
    try {
      const mount = await mountManager.mount(expanded)
      registry = registerVault(registry, { path: mount.folder, workspaceId: mount.workspaceId, label })
      registry = touchVault(registry, mount.workspaceId)
      saveRegistry(registry, registryFile)
      return sendJson(res, 200, {
        ...workspaceJson(mount),
        workspaceUrlId: mount.workspaceUrlId,
        loginPath: `/local-login?to=/app/w/${mount.workspaceUrlId}`,
      })
    } catch (error) {
      log.error({ path: expanded, error: String(error) }, 'Failed to mount vault')
      return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Unmount a vault (MountManager.unmount also force-closes its yjs room — see
  // mount-manager.ts) and drop it from the registry. If it was the active
  // vault, promote the most-recently-opened survivor so `/local-login` (no
  // `?to=`) keeps resolving to something. Registry-only — never touches disk.
  const unmountVault = async (id: string, res: ServerResponse): Promise<void> => {
    const mount = findMount(id)
    const workspaceId = mount?.workspaceId ?? id
    const hadEntry = registry.vaults.some((v) => v.workspaceId === workspaceId)
    if (!mount && !hadEntry) {
      return sendJson(res, 404, { error: 'Unknown vault' })
    }
    if (mount) {
      await mountManager.unmount(mount.workspaceId)
    }
    registry = unregisterVault(registry, workspaceId)
    if (!registry.activeWorkspaceId && registry.vaults.length > 0) {
      const next = byRecency(registry.vaults)[0]
      registry = touchVault(registry, next.workspaceId, next.lastOpenedAt) // promote without bumping recency
    }
    saveRegistry(registry, registryFile)
    return sendJson(res, 200, { success: true })
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    setCors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', baseUrl)
    const p = url.pathname
    const method = req.method ?? 'GET'

    // --- Dead app-channel socket.io (papercut #2): keep it connected & quiet. ---
    if (socketIoStub.handleHttp(req, res, p, url.searchParams)) return

    // --- MCP (streamable HTTP, stateless) — WP-C's pull channel for MCP-capable agents. ---
    if (mcpHandler.handle(req, res, p)) return

    // --- Frontend bundle + login shim + `/` redirect (same-origin). ---
    if (staticWeb.handle(req, res, p)) return

    // --- Auth: gates ProtectedRoute. Accept any bearer. ---
    if (p === '/auth/me' && method === 'GET') return sendJson(res, 200, LOCAL_USER)

    // --- Workspaces (one per live mount) ---
    if (p === '/workspaces' && method === 'GET') {
      return sendJson(res, 200, mountManager.list().map(workspaceJson))
    }
    const wsShow = p.match(/^\/workspaces\/([^/]+)$/)
    if (wsShow && method === 'GET') {
      const mount = findMount(wsShow[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      return sendJson(res, 200, workspaceJson(mount))
    }

    // POST /workspaces/:id/yjs-socket-token — mint HMAC token verified by the yjs core.
    // Mints unconditionally for any :id (matches pre-Phase-2 behavior) — the
    // socket connection itself is what actually requires a live mount/room.
    const tokenMatch = p.match(/^\/workspaces\/([^/]+)\/yjs-socket-token$/)
    if (tokenMatch && method === 'POST') {
      const minted = mintSocketToken(secret, tokenMatch[1])
      log.debug({ workspaceId: tokenMatch[1] }, 'Minted socket token')
      return sendJson(res, 200, minted)
    }

    // GET /workspaces/:id/organization  (remains after agent removal; same local org for every mount)
    if (/^\/workspaces\/[^/]+\/organization$/.test(p) && method === 'GET') {
      return sendJson(res, 200, organization)
    }
    // GET /workspaces/:id/document-shares  (remains after agent removal).
    // Shape MUST be { shares: [] } — the frontend does data.shares.find(...).
    if (/^\/workspaces\/[^/]+\/document-shares$/.test(p) && method === 'GET') {
      return sendJson(res, 200, { shares: [] })
    }

    // POST /workspaces/:id/files — multipart upload → write into that mount's canvas dir.
    const filesMatch = p.match(/^\/workspaces\/([^/]+)\/files$/)
    if (filesMatch && method === 'POST') {
      const mount = findMount(filesMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void handleUpload(mount, req, res)
      return
    }

    // PUT /workspaces/:id/notes/:nodeId/content — user-edit autosave (Mission A1).
    // Body: { body: string, baseHash?: string, force?: boolean }. Wired exactly
    // like the upload route above: resolve the mount, hand off to its orchestrator.
    const noteContentMatch = p.match(/^\/workspaces\/([^/]+)\/notes\/([^/]+)\/content$/)
    if (noteContentMatch && method === 'PUT') {
      const mount = findMount(noteContentMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        try {
          const parsedBody = await readJsonBody(req, MAX_NOTE_BODY_BYTES)
          if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null) {
            return sendJson(res, 400, { error: 'Expected a JSON body' })
          }
          const reqBody = parsedBody.value as { body?: unknown; baseHash?: unknown; force?: unknown }
          if (typeof reqBody.body !== 'string') {
            return sendJson(res, 400, { error: 'body is required' })
          }
          const baseHash = typeof reqBody.baseHash === 'string' ? reqBody.baseHash : undefined
          const result = await mount.orchestrator.handleNoteSave({
            nodeId: noteContentMatch[2],
            body: reqBody.body,
            baseHash,
            force: reqBody.force === true,
          })
          if (result.status === 200) return sendJson(res, 200, { hash: result.hash, relPath: result.relPath })
          if (result.status === 409) return sendJson(res, 409, { diskHash: result.diskHash })
          return sendJson(res, result.status, { error: result.error })
        } catch (error) {
          log.error({ nodeId: noteContentMatch[2], error: String(error) }, 'Note save failed')
          return sendJson(res, 500, { error: 'Note save failed' })
        }
      })()
      return
    }

    // POST /workspaces/:id/flush — on-demand flush: force the room's pending
    // debounced save through to the FolderStore, then force the flusher's pending
    // debounced write through to disk. Lets an external CLI agent be sure it is
    // reading the freshest daemon-authored state instead of waiting out both
    // debounce windows.
    const flushMatch = p.match(/^\/workspaces\/([^/]+)\/flush$/)
    if (flushMatch && method === 'POST') {
      const mount = findMount(flushMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        try {
          await roomManager.flushWorkspace(mount.workspaceId)
          await mount.orchestrator.flusher.flushNow()
          return sendJson(res, 200, { flushed: true })
        } catch (error) {
          log.error({ workspaceId: mount.workspaceId, error: String(error) }, 'On-demand flush failed')
          return sendJson(res, 500, { error: 'Flush failed' })
        }
      })()
      return
    }

    // --- Vault management (for the Phase 3 CLI: `kanwas up` registers via
    // POST /vaults instead of stop-and-switch; `ls`/`rm`/`status` read/call these). ---
    if (p === '/vaults' && method === 'GET') {
      const mountedIds = new Set(mountManager.list().map((m) => m.workspaceId))
      return sendJson(
        res,
        200,
        registry.vaults.map((v) => ({
          ...v,
          mounted: mountedIds.has(v.workspaceId),
          active: v.workspaceId === registry.activeWorkspaceId,
        }))
      )
    }
    if (p === '/vaults' && method === 'POST') {
      void (async () => {
        const parsedBody = await readJsonBody(req)
        if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null) {
          return sendJson(res, 400, { error: 'Expected a JSON body' })
        }
        const body = parsedBody.value as { path?: unknown; label?: unknown }
        if (typeof body.path !== 'string' || body.path.length === 0) {
          return sendJson(res, 400, { error: 'path is required' })
        }
        const label = typeof body.label === 'string' && body.label.length > 0 ? body.label : undefined
        return mountVault(body.path, label, res)
      })()
      return
    }
    const vaultMatch = p.match(/^\/vaults\/([^/]+)$/)
    if (vaultMatch && method === 'DELETE') {
      void unmountVault(vaultMatch[1], res)
      return
    }

    // --- Terminal (embedded PTY sessions; WP-D) — Bearer handling mirrors every
    // other route above: none. The daemon is loopback-trusted; auth is "any
    // non-empty token", enforced (only for the WS upgrade) below. ---
    if (p === '/terminal/agents' && method === 'GET') {
      void detectAgents().then((agents) => sendJson(res, 200, { agents }))
      return
    }
    const termListMatch = p.match(/^\/workspaces\/([^/]+)\/terminal-sessions$/)
    if (termListMatch && method === 'GET') {
      const mount = findMount(termListMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      return sendJson(res, 200, { sessions: terminalManager.list(mount.workspaceId) })
    }
    if (termListMatch && method === 'POST') {
      const mount = findMount(termListMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        const parsedBody = await readJsonBody(req)
        if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null) {
          return sendJson(res, 400, { error: 'Expected a JSON body' })
        }
        const body = parsedBody.value as { agent?: unknown; cols?: unknown; rows?: unknown; theme?: unknown }
        if (typeof body.agent !== 'string' || !isAgentId(body.agent)) {
          return sendJson(res, 400, { error: 'Unknown agent' })
        }
        const agents = await detectAgents()
        const info = agents.find((a) => a.id === body.agent)
        if (!info?.available) {
          return sendJson(res, 400, { error: `Agent "${body.agent}" is not available` })
        }
        // Optional UI theme hint (COLORFGBG for auto-detecting CLIs) — anything
        // other than exactly 'light'/'dark' is treated as absent, not a 400.
        const theme = body.theme === 'light' || body.theme === 'dark' ? body.theme : undefined
        const session = terminalManager.createSession({
          workspaceId: mount.workspaceId,
          folder: mount.folder,
          agent: body.agent,
          cols: typeof body.cols === 'number' ? body.cols : undefined,
          rows: typeof body.rows === 'number' ? body.rows : undefined,
          theme,
        })
        return sendJson(res, 200, session)
      })()
      return
    }
    const termDeleteMatch = p.match(/^\/workspaces\/([^/]+)\/terminal-sessions\/([^/]+)$/)
    if (termDeleteMatch && method === 'DELETE') {
      const mount = findMount(termDeleteMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      if (!terminalManager.belongsTo(termDeleteMatch[2], mount.workspaceId)) {
        return sendJson(res, 404, { error: 'Unknown terminal session' })
      }
      terminalManager.remove(termDeleteMatch[2])
      res.writeHead(204)
      return res.end()
    }

    // --- UI context (WP-C: canvas selection / open document / text selection,
    // reported by the frontend and consumed by the "push into terminal" flow
    // AND the MCP kanwas_get_ui_context tool). In-memory only — see
    // terminal/ui-context.ts. ---
    const uiContextMatch = p.match(/^\/workspaces\/([^/]+)\/ui-context$/)
    if (uiContextMatch && method === 'POST') {
      const mount = findMount(uiContextMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        const parsedBody = await readJsonBody(req)
        if (!parsedBody.ok) return sendJson(res, 400, { error: 'Expected a JSON body' })
        uiContextStore.set(mount.workspaceId, parseUiContextInput(parsedBody.value))
        res.writeHead(204)
        return res.end()
      })()
      return
    }
    if (uiContextMatch && method === 'GET') {
      const mount = findMount(uiContextMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      const stored = uiContextStore.get(mount.workspaceId)
      const enriched = stored ? enrichContext(mount, stored.input, stored.updatedAt) : emptyEnrichedContext()
      return sendJson(res, 200, enriched)
    }

    // POST /workspaces/:id/resolve-context {nodeId, text?} → {path, startLine?, endLine?} —
    // the "push into terminal" flow's single resolution call (also used by the button
    // to compose `@path` / `path:L1-L2` references).
    const resolveContextMatch = p.match(/^\/workspaces\/([^/]+)\/resolve-context$/)
    if (resolveContextMatch && method === 'POST') {
      const mount = findMount(resolveContextMatch[1])
      if (!mount) return sendJson(res, 404, { error: 'Unknown workspace' })
      void (async () => {
        const parsedBody = await readJsonBody(req)
        if (!parsedBody.ok || typeof parsedBody.value !== 'object' || parsedBody.value === null) {
          return sendJson(res, 400, { error: 'Expected a JSON body' })
        }
        const body = parsedBody.value as { nodeId?: unknown; text?: unknown }
        if (typeof body.nodeId !== 'string' || body.nodeId.length === 0) {
          return sendJson(res, 400, { error: 'nodeId is required' })
        }
        const text = typeof body.text === 'string' ? body.text : undefined
        const resolved = resolveRef(mount, body.nodeId, text)
        if (!resolved) return sendJson(res, 404, { error: 'Could not resolve nodeId to a file on disk' })
        return sendJson(res, 200, resolved)
      })()
      return
    }

    // --- Files ---
    // GET /files/signed-url?path=<storagePath>[&ws=<workspaceId>] → a URL this
    // server serves the bytes from. Resolves the owning mount (see
    // workspace-resolution.ts): explicit `ws` → Referer `/app/w/<urlId>` → the
    // mount whose folder actually contains the file (active wins on ties).
    if (p === '/files/signed-url' && method === 'GET') {
      const storagePath = url.searchParams.get('path') ?? ''
      const resolved = resolveFilesWorkspace({
        wsParam: url.searchParams.get('ws'),
        refererPath: refererPathname(req.headers.referer),
        mounts: resolvableMounts(),
        activeWorkspaceId: getActiveWorkspaceId(),
        relPath: storagePath,
        existsInFolder,
      })
      if (!resolved) return sendJson(res, 404, { error: 'Could not resolve a workspace for this file' })
      const raw = `${baseUrl}/files/raw?ws=${encodeURIComponent(resolved.workspaceId)}&path=${encodeURIComponent(storagePath)}`
      return sendJson(res, 200, { url: raw })
    }
    // GET /files/raw?ws=<workspaceId>&path=<storagePath> → stream bytes from that
    // mount's folder. `ws` is always present in URLs this server mints, but the
    // same 3-step resolution runs anyway for robustness (e.g. a stale/hand-built URL).
    if (p === '/files/raw' && (method === 'GET' || method === 'HEAD')) {
      const relPath = url.searchParams.get('path') ?? ''
      const resolved = resolveFilesWorkspace({
        wsParam: url.searchParams.get('ws'),
        refererPath: refererPathname(req.headers.referer),
        mounts: resolvableMounts(),
        activeWorkspaceId: getActiveWorkspaceId(),
        relPath,
        existsInFolder,
      })
      const abs = resolved ? resolveInsideFolder(resolved.folder, relPath) : null
      if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404)
        return res.end('not found')
      }
      const ext = path.extname(abs).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
      if (method === 'HEAD') return res.end()
      return fs.createReadStream(abs).pipe(res)
    }

    // --- User config (remains after agent removal) ---
    if (p === '/user-config') {
      if (method === 'GET') return sendJson(res, 200, {})
      if (method === 'PATCH' || method === 'PUT') return sendJson(res, 200, {})
    }
    if (p === '/organizations' && method === 'GET') return sendJson(res, 200, [organization])

    // (App-channel /socket.io is handled up top by socketIoStub.)

    // Permissive catch-all so stray calls never hard-error and break the render:
    // config/stats/settings-shaped GETs → object; other collections → array.
    log.debug({ method, path: p }, 'Unhandled REST call (stubbed)')
    if (method === 'GET' || method === 'HEAD') {
      if (/(config|stats|settings|status|state|me)$/i.test(p)) return sendJson(res, 200, {})
      return sendJson(res, 200, [])
    }
    return sendJson(res, 200, {})
  })

  // Terminal WS attach — noServer, wired into the SAME http server's 'upgrade'
  // event below (mirrors the socketIoStub pattern above it).
  const terminalWss = new WebSocketServer({ noServer: true })
  const terminalAttachPath = /^\/workspaces\/([^/]+)\/terminal-sessions\/([^/]+)\/attach$/

  // Accept the dead app-channel socket's websocket upgrade with a minimal
  // Engine.IO handshake (papercut #2); accept a terminal attach; destroy any
  // other upgrade.
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', baseUrl)
    const p = url.pathname
    if (socketIoStub.handleUpgrade(req, socket, head, p)) return

    const attachMatch = p.match(terminalAttachPath)
    if (attachMatch) {
      const [, workspaceParam, sessionId] = attachMatch
      const token = url.searchParams.get('token')
      const mount = findMount(workspaceParam)
      // "Accept any non-empty token" — same trust model as the REST routes
      // (no real validation), just a presence check for the WS handshake.
      if (!token || !mount) {
        socket.destroy()
        return
      }
      terminalWss.handleUpgrade(req, socket, head, (ws) => {
        if (!terminalManager.belongsTo(sessionId, mount.workspaceId)) {
          ws.close(4404, 'Unknown terminal session')
          return
        }
        log.info({ workspaceId: mount.workspaceId, sessionId }, 'Terminal client attached')
        terminalManager.attach(sessionId, ws)
      })
      return
    }

    socket.destroy()
  })

  server.listen(port, host)
  await once(server, 'listening')
  log.info({ baseUrl }, 'REST server listening')

  return {
    server,
    baseUrl,
    async close() {
      socketIoStub.close()
      for (const client of terminalWss.clients) client.terminate()
      terminalWss.close()
      server.close()
      await once(server, 'close').catch(() => {})
    },
  }
}
