// Embedded PTY terminal core (WP-D). Spawns a real coding agent (or a plain
// shell) via node-pty, cwd'd into a mounted workspace folder, and multiplexes
// its I/O over any number of WebSocket "attachments". Sessions are
// process-lifetime objects independent of any single WS connection: closing
// the terminal panel (or reloading the page) detaches, it does NOT kill —
// the agent keeps running headless until explicitly killed/removed or the
// runtime shuts down.
import { randomUUID } from 'node:crypto'
import { spawn, type IPty } from 'node-pty'
import type { Logger } from 'pino'
import type { RawData, WebSocket } from 'ws'
import { agentSpawnSpec, type AgentId } from './agents.js'

/** Ring-buffer cap per session: enough scrollback to feel real, bounded per session. */
const SCROLLBACK_MAX_BYTES = 1024 * 1024 // ~1 MB
/** Grace period between SIGTERM and the SIGKILL escalation. */
const KILL_GRACE_MS = 3000
export const TERMINAL_MIN_COLS = 1
export const TERMINAL_MAX_COLS = 500
export const TERMINAL_MIN_ROWS = 1
export const TERMINAL_MAX_ROWS = 300

function isValidDimension(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum
}

export function isValidTerminalSize(cols: number, rows: number): boolean {
  return (
    isValidDimension(cols, TERMINAL_MIN_COLS, TERMINAL_MAX_COLS) &&
    isValidDimension(rows, TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
  )
}

export interface TerminalSession {
  id: string
  /** Agent id, deduped with a numeric suffix within the owning workspace ("claude", "claude-2", ...). */
  title: string
  agent: AgentId
  /** The literal binary spawned (see agentSpawnSpec). */
  command: string
  status: 'running' | 'exited'
  exitCode?: number
  createdAt: string
  cols: number
  rows: number
}

export interface CreateSessionOptions {
  /** Owning workspace — scopes list()/belongsTo() and session-title deduping. Not part of the public session shape. */
  workspaceId: string
  /** Workspace folder — becomes the pty's cwd and KANWAS_WORKSPACE_DIR. */
  folder: string
  agent: AgentId
  cols?: number
  rows?: number
  /**
   * Optional UI theme hint, forwarded from the renderer's create-session
   * request. Drives the `COLORFGBG` env var so CLIs that auto-detect terminal
   * background (e.g. Claude Code's `theme: auto`) render appropriately
   * instead of defaulting to dark-theme output on a light terminal.
   */
  theme?: 'light' | 'dark'
}

interface SessionRecord {
  session: TerminalSession
  workspaceId: string
  proc: IPty
  /** Oldest-first chunks; trimmed from the front once scrollbackBytes exceeds the cap. */
  scrollback: Buffer[]
  scrollbackBytes: number
  attached: Set<WebSocket>
  killTimer?: NodeJS.Timeout
}

const OPEN = 1 // WebSocket.OPEN — checked as a raw number so this also works against a mocked socket in tests.

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

export interface TerminalSessionManagerOptions {
  logger: Logger
  /** Streamable-HTTP MCP endpoint injected into Codex and Claude Code sessions. */
  mcpUrl: string
}

export class TerminalSessionManager {
  private readonly logger: Logger
  private readonly mcpUrl: string
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(options: TerminalSessionManagerOptions) {
    this.logger = options.logger.child({ component: 'TerminalSessionManager' })
    this.mcpUrl = options.mcpUrl
  }

  /** Spawn a new PTY session. cwd = the workspace folder; env carries TERM/COLORTERM/KANWAS_WORKSPACE_DIR. */
  createSession(options: CreateSessionOptions): TerminalSession {
    const { workspaceId, folder, agent, theme } = options
    const cols = options.cols ?? 80
    const rows = options.rows ?? 24
    if (!isValidTerminalSize(cols, rows)) {
      throw new Error(
        `Terminal dimensions must be integer columns ${TERMINAL_MIN_COLS}-${TERMINAL_MAX_COLS} and rows ${TERMINAL_MIN_ROWS}-${TERMINAL_MAX_ROWS}`
      )
    }
    const spec = agentSpawnSpec(agent, process.env, process.platform, { mcpUrl: this.mcpUrl })

    const proc = spawn(spec.command, spec.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: folder,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        KANWAS_WORKSPACE_DIR: folder,
        // 0;15 = black-on-white (light bg); 15;0 = white-on-black (dark bg).
        // Absent when `theme` isn't provided — preserves prior behavior exactly.
        ...(theme ? { COLORFGBG: theme === 'light' ? '0;15' : '15;0' } : {}),
      },
    })

    const id = randomUUID()
    const session: TerminalSession = {
      id,
      title: this.nextTitle(agent, workspaceId),
      agent,
      command: spec.command,
      status: 'running',
      createdAt: new Date().toISOString(),
      cols,
      rows,
    }
    const record: SessionRecord = {
      session,
      workspaceId,
      proc,
      scrollback: [],
      scrollbackBytes: 0,
      attached: new Set(),
    }
    this.sessions.set(id, record)

    proc.onData((data) => {
      const chunk = Buffer.from(data, 'utf-8')
      this.pushScrollback(record, chunk)
      this.broadcastBinary(record, chunk)
    })
    proc.onExit(({ exitCode }) => {
      if (record.killTimer) {
        clearTimeout(record.killTimer)
        record.killTimer = undefined
      }
      record.session.status = 'exited'
      record.session.exitCode = exitCode
      this.logger.info({ sessionId: id, workspaceId, exitCode }, 'Terminal session exited')
      this.broadcastText(record, JSON.stringify({ type: 'exit', exitCode }))
    })

    this.logger.info(
      { sessionId: id, workspaceId, agent, command: spec.command, cols, rows },
      'Created terminal session'
    )
    return session
  }

  /**
   * Attach a live WS to a session: replay scrollback (binary), then stream live
   * output to it and route its input (binary → stdin, text → JSON control) back
   * into the pty. Returns false if the session doesn't exist. Detaching (the ws
   * closing) only stops the broadcast — it never touches the underlying process.
   */
  attach(sessionId: string, ws: WebSocket): boolean {
    const record = this.sessions.get(sessionId)
    if (!record) return false

    if (record.scrollback.length > 0) {
      ws.send(Buffer.concat(record.scrollback))
    }
    if (record.session.status === 'exited') {
      // Session already finished before this attach — still tell the client so its UI reflects it.
      ws.send(JSON.stringify({ type: 'exit', exitCode: record.session.exitCode }))
    }

    record.attached.add(ws)
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        this.write(sessionId, toBuffer(data))
        return
      }
      this.handleControlMessage(sessionId, data.toString())
    })
    const detach = () => record.attached.delete(ws)
    ws.on('close', detach)
    ws.on('error', detach)
    return true
  }

  /** Parse a client→server text (JSON control) frame. Malformed/unknown frames are ignored, not fatal. */
  private handleControlMessage(sessionId: string, raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const msg = parsed as { type?: unknown; cols?: unknown; rows?: unknown }
    if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
      this.resize(sessionId, msg.cols, msg.rows)
    }
  }

  /** Write raw bytes to the pty's stdin. No-op for unknown or already-exited sessions. */
  write(sessionId: string, data: string | Buffer): void {
    const record = this.sessions.get(sessionId)
    if (!record || record.session.status !== 'running') return
    try {
      record.proc.write(typeof data === 'string' ? data : data.toString('utf-8'))
    } catch (error) {
      this.logger.warn({ error: String(error), sessionId }, 'Could not write to terminal session')
    }
  }

  /** Resize the pty. No-op for unknown/non-positive dimensions or an already-exited session. */
  resize(sessionId: string, cols: number, rows: number): void {
    const record = this.sessions.get(sessionId)
    if (!record || record.session.status !== 'running') return
    if (!isValidTerminalSize(cols, rows)) return
    try {
      record.proc.resize(cols, rows)
      record.session.cols = cols
      record.session.rows = rows
    } catch (error) {
      this.logger.warn({ error: String(error), sessionId, cols, rows }, 'Could not resize terminal session')
    }
  }

  /** SIGTERM now, SIGKILL after a grace period if the process hasn't exited by then. */
  kill(sessionId: string): void {
    const record = this.sessions.get(sessionId)
    if (!record || record.session.status !== 'running') return
    try {
      if (process.platform === 'win32') record.proc.kill()
      else record.proc.kill('SIGTERM')
    } catch {
      /* process already gone */
    }
    if (process.platform === 'win32') return
    record.killTimer = setTimeout(() => {
      if (record.session.status === 'running') {
        try {
          record.proc.kill('SIGKILL')
        } catch {
          /* already gone */
        }
      }
    }, KILL_GRACE_MS)
    record.killTimer.unref?.()
  }

  /** Kill (if running) and drop the session record entirely. Returns false if the session didn't exist. */
  remove(sessionId: string): boolean {
    const record = this.sessions.get(sessionId)
    if (!record) return false
    if (record.session.status === 'running') this.kill(sessionId)
    for (const ws of record.attached) {
      try {
        ws.close(1000, 'Terminal session removed')
      } catch {
        /* already closed */
      }
    }
    record.attached.clear()
    this.sessions.delete(sessionId)
    return true
  }

  get(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId)?.session
  }

  /** True if `sessionId` exists AND belongs to `workspaceId` — the WS attach/DELETE ownership check. */
  belongsTo(sessionId: string, workspaceId: string): boolean {
    return this.sessions.get(sessionId)?.workspaceId === workspaceId
  }

  /** All sessions, or just those owned by `workspaceId` when given. */
  list(workspaceId?: string): TerminalSession[] {
    const records = [...this.sessions.values()]
    return (workspaceId ? records.filter((r) => r.workspaceId === workspaceId) : records).map((r) => r.session)
  }

  /** Runtime shutdown: terminate every live process and wait briefly for exits. */
  async disposeAll(timeoutMs = 4_000): Promise<void> {
    const records = [...this.sessions.values()]
    await this.disposeRecords(records, timeoutMs, 'all terminal sessions')
  }

  /** Stop and forget only the terminal processes owned by one workspace. */
  async disposeWorkspace(workspaceId: string, timeoutMs = 4_000): Promise<void> {
    const records = [...this.sessions.values()].filter((record) => record.workspaceId === workspaceId)
    await this.disposeRecords(records, timeoutMs, `terminal sessions for workspace ${workspaceId}`)

    const stillRunning = records.filter((record) => record.session.status === 'running')
    if (stillRunning.length > 0) {
      throw new Error(`Timed out stopping ${stillRunning.length} terminal session(s) for workspace ${workspaceId}`)
    }

    for (const record of records) {
      if (this.sessions.get(record.session.id) === record) this.sessions.delete(record.session.id)
      record.attached.clear()
      record.scrollback = []
      record.scrollbackBytes = 0
    }
  }

  private async disposeRecords(records: SessionRecord[], timeoutMs: number, description: string): Promise<void> {
    for (const record of records) {
      for (const ws of record.attached) {
        try {
          ws.close(1001, 'Runtime shutting down')
        } catch {
          /* ignore */
        }
      }
      if (record.session.status === 'running') this.kill(record.session.id)
    }
    this.logger.info({ count: records.length }, `Disposing ${description}`)
    const deadline = Date.now() + timeoutMs
    while (records.some((record) => record.session.status === 'running')) {
      if (Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  private nextTitle(agent: AgentId, workspaceId: string): string {
    const titles = new Set(
      [...this.sessions.values()].filter((r) => r.workspaceId === workspaceId).map((r) => r.session.title)
    )
    if (!titles.has(agent)) return agent
    let n = 2
    while (titles.has(`${agent}-${n}`)) n++
    return `${agent}-${n}`
  }

  private pushScrollback(record: SessionRecord, chunk: Buffer): void {
    record.scrollback.push(chunk)
    record.scrollbackBytes += chunk.length
    while (record.scrollbackBytes > SCROLLBACK_MAX_BYTES && record.scrollback.length > 0) {
      const dropped = record.scrollback.shift()
      if (dropped) record.scrollbackBytes -= dropped.length
    }
  }

  private broadcastBinary(record: SessionRecord, chunk: Buffer): void {
    for (const ws of record.attached) {
      if (ws.readyState !== OPEN) continue
      try {
        ws.send(chunk)
      } catch {
        record.attached.delete(ws)
      }
    }
  }

  private broadcastText(record: SessionRecord, text: string): void {
    for (const ws of record.attached) {
      if (ws.readyState !== OPEN) continue
      try {
        ws.send(text)
      } catch {
        record.attached.delete(ws)
      }
    }
  }
}
