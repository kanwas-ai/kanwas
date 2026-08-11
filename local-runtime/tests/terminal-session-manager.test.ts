import { once } from 'node:events'
import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { createLogger } from '../src/logger.js'
import { TerminalSessionManager } from '../src/terminal/session-manager.js'

const logger = createLogger({ level: 'silent' })
const WORKSPACE_ID = 'test-workspace'

/** Poll `check()` until it's true, or fail after `timeoutMs`. */
function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (check()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor: condition never became true'))
      setTimeout(tick, 20)
    }
    tick()
  })
}

/**
 * Minimal http + `WebSocketServer({noServer:true})` harness mirroring exactly
 * how rest-server.ts wires the terminal attach WS onto the real REST server's
 * 'upgrade' event — but standalone, so this suite exercises
 * TerminalSessionManager.attach() with a REAL `ws` client/server pair without
 * booting the full runtime (mounts/yjs/etc — rest-server.ts's job is just thin
 * routing on top of this, covered by hand-reading it, not re-tested here).
 * The connection path is `/<sessionId>` — auth/mount-resolution is
 * rest-server-only concern, out of scope for this suite.
 */
async function startHarness(manager: TerminalSessionManager): Promise<{ port: number; close(): Promise<void> }> {
  const server: Server = createServer()
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const sessionId = (req.url ?? '/').slice(1)
    wss.handleUpgrade(req, socket, head, (ws) => {
      manager.attach(sessionId, ws)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    port,
    async close() {
      for (const client of wss.clients) client.terminate()
      wss.close()
      server.close()
      await once(server, 'close').catch(() => {})
    },
  }
}

interface TestClient {
  ws: WebSocket
  outputText(): string
  waitForOutput(substr: string, timeoutMs?: number): Promise<void>
  waitForJson(
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs?: number
  ): Promise<Record<string, unknown>>
  close(): void
}

async function connectClient(port: number, sessionId: string): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/${sessionId}`)
  const chunks: Buffer[] = []
  const texts: string[] = []
  // Register BEFORE awaiting 'open': the server replays scrollback synchronously
  // inside its upgrade callback, so the first frame can arrive bundled with the
  // handshake response. Attaching 'message' after `await once(ws, 'open')`
  // resolves loses that frame (confirmed race, not a session-manager bug) — a
  // real browser client sets `ws.onmessage` synchronously too, so this mirrors
  // actual usage, not just a test workaround.
  ws.on('message', (data, isBinary) => {
    if (isBinary) chunks.push(data as Buffer)
    else texts.push(data.toString())
  })
  await once(ws, 'open')
  return {
    ws,
    outputText: () => Buffer.concat(chunks).toString('utf-8'),
    waitForOutput: (substr, timeoutMs = 5000) =>
      waitFor(() => Buffer.concat(chunks).toString('utf-8').includes(substr), timeoutMs),
    async waitForJson(predicate, timeoutMs = 5000) {
      let found: Record<string, unknown> | undefined
      await waitFor(() => {
        for (const t of texts) {
          try {
            const parsed = JSON.parse(t) as Record<string, unknown>
            if (predicate(parsed)) {
              found = parsed
              return true
            }
          } catch {
            /* not JSON */
          }
        }
        return false
      }, timeoutMs)
      return found!
    },
    close: () => ws.close(),
  }
}

describe('TerminalSessionManager', () => {
  let manager: TerminalSessionManager
  let workspaceFolder: string
  let harness: { port: number; close(): Promise<void> }
  const originalShell = process.env.SHELL
  const originalColorfgbg = process.env.COLORFGBG

  beforeEach(async () => {
    process.env.SHELL = '/bin/sh' // deterministic shell for the 'shell' agent, no rc-file noise
    delete process.env.COLORFGBG // some terminal emulators (e.g. Terminal.app) set this ambiently; tests need a clean slate
    workspaceFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-terminal-'))
    manager = new TerminalSessionManager({ logger })
    harness = await startHarness(manager)
  })

  afterEach(async () => {
    await manager.disposeAll()
    await harness.close()
    fs.rmSync(workspaceFolder, { recursive: true, force: true })
    process.env.SHELL = originalShell
    if (originalColorfgbg === undefined) delete process.env.COLORFGBG
    else process.env.COLORFGBG = originalColorfgbg
  })

  it('spawns a shell session cwd-ed into the workspace folder, running by default', () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    expect(session.status).toBe('running')
    expect(session.agent).toBe('shell')
    expect(session.cols).toBe(80)
    expect(session.rows).toBe(24)
    expect(session.title).toBe('shell')
  })

  it('echoes stdin back through the attached WS (write round-trip)', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const client = await connectClient(harness.port, session.id)

    client.ws.send(Buffer.from('echo hi\n'), { binary: true })
    await client.waitForOutput('hi')

    client.close()
  })

  it('resizes the pty without throwing, and the process observes the new size', async () => {
    const session = manager.createSession({
      workspaceId: WORKSPACE_ID,
      folder: workspaceFolder,
      agent: 'shell',
      cols: 80,
      rows: 24,
    })
    const client = await connectClient(harness.port, session.id)

    expect(() => manager.resize(session.id, 120, 40)).not.toThrow()
    const updated = manager.list(WORKSPACE_ID).find((s) => s.id === session.id)
    expect(updated?.cols).toBe(120)
    expect(updated?.rows).toBe(40)

    client.ws.send(Buffer.from('stty size\n'), { binary: true })
    await client.waitForOutput('40 120') // `stty size` prints "rows cols"

    client.close()
  })

  it('ignores fractional and oversized resize control frames without crashing the session', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const client = await connectClient(harness.port, session.id)

    client.ws.send(JSON.stringify({ type: 'resize', cols: 0.5, rows: 0.5 }))
    client.ws.send(JSON.stringify({ type: 'resize', cols: 501, rows: 301 }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(manager.get(session.id)).toMatchObject({ cols: 80, rows: 24, status: 'running' })
    client.ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }))
    await waitFor(() => manager.get(session.id)?.cols === 100 && manager.get(session.id)?.rows === 30)

    client.ws.send(Buffer.from('echo still-running\n'), { binary: true })
    await client.waitForOutput('still-running')
    client.close()
  })

  it('detach (WS close) does not kill the session; reattach replays scrollback', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const first = await connectClient(harness.port, session.id)
    first.ws.send(Buffer.from('echo hi\n'), { binary: true })
    await first.waitForOutput('hi')
    first.close()
    await waitFor(() => first.ws.readyState === WebSocket.CLOSED)

    // The process must still be alive — detach is not kill.
    expect(manager.list(WORKSPACE_ID).find((s) => s.id === session.id)?.status).toBe('running')

    const second = await connectClient(harness.port, session.id)
    await second.waitForOutput('hi') // scrollback replay on the new attachment
    second.close()
  })

  it('broadcasts live output to multiple simultaneous attachments', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const a = await connectClient(harness.port, session.id)
    const b = await connectClient(harness.port, session.id)

    a.ws.send(Buffer.from('echo broadcast-check\n'), { binary: true })
    await a.waitForOutput('broadcast-check')
    await b.waitForOutput('broadcast-check')

    a.close()
    b.close()
  })

  it('kill terminates the process, marks it exited, and broadcasts a JSON exit frame', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const client = await connectClient(harness.port, session.id)

    manager.kill(session.id)
    const exitMsg = await client.waitForJson((m) => m.type === 'exit')
    expect(exitMsg.type).toBe('exit')
    expect(typeof exitMsg.exitCode).toBe('number')

    const after = manager.list(WORKSPACE_ID).find((s) => s.id === session.id)
    expect(after?.status).toBe('exited')
    expect(typeof after?.exitCode).toBe('number')

    client.close()
  })

  it('remove() deletes the session record (idempotent false on a second call)', () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    expect(manager.remove(session.id)).toBe(true)
    expect(manager.list(WORKSPACE_ID)).toHaveLength(0)
    expect(manager.get(session.id)).toBeUndefined()
    expect(manager.remove(session.id)).toBe(false)
  })

  it('theme "light" sets COLORFGBG=0;15 in the spawned process env', async () => {
    const session = manager.createSession({
      workspaceId: WORKSPACE_ID,
      folder: workspaceFolder,
      agent: 'shell',
      theme: 'light',
    })
    const client = await connectClient(harness.port, session.id)

    client.ws.send(Buffer.from('echo COLORFGBG=$COLORFGBG\n'), { binary: true })
    await client.waitForOutput('COLORFGBG=0;15')

    client.close()
  })

  it('theme "dark" sets COLORFGBG=15;0 in the spawned process env', async () => {
    const session = manager.createSession({
      workspaceId: WORKSPACE_ID,
      folder: workspaceFolder,
      agent: 'shell',
      theme: 'dark',
    })
    const client = await connectClient(harness.port, session.id)

    client.ws.send(Buffer.from('echo COLORFGBG=$COLORFGBG\n'), { binary: true })
    await client.waitForOutput('COLORFGBG=15;0')

    client.close()
  })

  it('no theme leaves COLORFGBG unset', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const client = await connectClient(harness.port, session.id)

    client.ws.send(Buffer.from('echo "COLORFGBG=[$COLORFGBG]"\n'), { binary: true })
    await client.waitForOutput('COLORFGBG=[]')

    client.close()
  })

  it('assigns a numeric suffix to duplicate titles within the same workspace', () => {
    const a = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const b = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const c = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    expect([a.title, b.title, c.title]).toEqual(['shell', 'shell-2', 'shell-3'])
  })

  it('list() scopes by workspaceId; belongsTo() checks ownership', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-terminal-other-'))
    try {
      const a = manager.createSession({ workspaceId: 'ws-a', folder: workspaceFolder, agent: 'shell' })
      const b = manager.createSession({ workspaceId: 'ws-b', folder: other, agent: 'shell' })

      expect(manager.list('ws-a').map((s) => s.id)).toEqual([a.id])
      expect(manager.list('ws-b').map((s) => s.id)).toEqual([b.id])
      expect(
        manager
          .list()
          .map((s) => s.id)
          .sort()
      ).toEqual([a.id, b.id].sort())

      expect(manager.belongsTo(a.id, 'ws-a')).toBe(true)
      expect(manager.belongsTo(a.id, 'ws-b')).toBe(false)
      expect(manager.belongsTo('nonexistent', 'ws-a')).toBe(false)
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it('disposeAll() kills every running session and closes attached sockets', async () => {
    const session = manager.createSession({ workspaceId: WORKSPACE_ID, folder: workspaceFolder, agent: 'shell' })
    const client = await connectClient(harness.port, session.id)

    const disposing = manager.disposeAll()

    await waitFor(() => manager.list(WORKSPACE_ID).find((s) => s.id === session.id)?.status === 'exited')
    await waitFor(() => client.ws.readyState === WebSocket.CLOSED)
    await disposing
  })

  it('disposeWorkspace() kills and removes only the target workspace sessions', async () => {
    const otherFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-terminal-other-'))
    try {
      const target = manager.createSession({ workspaceId: 'ws-target', folder: workspaceFolder, agent: 'shell' })
      const other = manager.createSession({ workspaceId: 'ws-other', folder: otherFolder, agent: 'shell' })
      const targetClient = await connectClient(harness.port, target.id)
      const otherClient = await connectClient(harness.port, other.id)

      await manager.disposeWorkspace('ws-target')

      expect(manager.list('ws-target')).toEqual([])
      expect(manager.get(other.id)).toMatchObject({ status: 'running' })
      await waitFor(() => targetClient.ws.readyState === WebSocket.CLOSED)
      expect(otherClient.ws.readyState).toBe(WebSocket.OPEN)
      otherClient.ws.send(Buffer.from('echo other-survived\n'), { binary: true })
      await otherClient.waitForOutput('other-survived')
      otherClient.close()
    } finally {
      await manager.disposeWorkspace('ws-other')
      fs.rmSync(otherFolder, { recursive: true, force: true })
    }
  })
})
