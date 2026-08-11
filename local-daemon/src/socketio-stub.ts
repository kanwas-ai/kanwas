import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Logger } from 'pino'
import { WebSocketServer, type WebSocket } from 'ws'

/**
 * A tiny, self-contained Engine.IO v4 + Socket.IO v4 stub for the ONE dead
 * app-channel socket the stock frontend opens at `VITE_API_URL/socket.io/`
 * (client.ts, a post-agent-removal leftover with no listeners). The daemon does
 * not speak socket.io, so without this the client's default `reconnection: true`
 * retries forever → endless red console errors + wasted cycles (papercut #2).
 *
 * We can't edit the tracked frontend, and `socket.io` isn't a daemon dependency,
 * so we hand-roll the minimal handshake to make the client believe it connected
 * and go quiet. The client is configured **websocket-first**
 * (`transports: ['websocket', 'polling']`) and — observed empirically — it never
 * falls back to polling; it just retries websocket. So the **websocket** path is
 * the one that matters:
 *
 *   1. WS open  ws://…/socket.io/?EIO=4&transport=websocket
 *   2. server → `0{sid,upgrades:[],pingInterval,pingTimeout,maxPayload}`  (Engine.IO OPEN)
 *   3. client → `40`                                                      (Socket.IO CONNECT to `/`)
 *   4. server → `40{"sid":…}`                                            (CONNECT reply → client fires `connect`, stops reconnecting)
 *   5. server → `2` every pingInterval; client → `3` (pong)              (Engine.IO heartbeat)
 *
 * An HTTP long-poll handler is kept as a fallback for completeness, but in
 * practice the websocket handshake succeeds and no polling occurs. Scope is
 * strictly `/socket.io/*`; everything else is untouched. This is deliberately not
 * a real socket.io server — just enough framing to silence a dead connection.
 */

const PING_INTERVAL_MS = 25_000
const PING_TIMEOUT_MS = 60_000
/** Reap HTTP-poll sessions with no activity for this long. */
const SESSION_TTL_MS = PING_INTERVAL_MS + PING_TIMEOUT_MS + 15_000
const RS = '\x1e' // Engine.IO v4 payload record separator

function openPacket(sid: string): string {
  return `0${JSON.stringify({
    sid,
    upgrades: [] as string[],
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    maxPayload: 1_000_000,
  })}`
}

interface HeldPoll {
  res: ServerResponse
  timer: NodeJS.Timeout
}

interface PollSession {
  outbox: string[]
  poll: HeldPoll | null
  lastSeen: number
}

export interface SocketIoStub {
  /** True if `pathname` targets the socket.io endpoint. */
  owns(pathname: string): boolean
  /** Handle an HTTP `/socket.io/*` request (polling fallback); returns true if handled. */
  handleHttp(req: IncomingMessage, res: ServerResponse, pathname: string, query: URLSearchParams): boolean
  /** Handle a `/socket.io/*` websocket upgrade (the transport the client uses). */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, pathname: string): boolean
  close(): void
}

export function createSocketIoStub(logger: Logger): SocketIoStub {
  const log = logger.child({ component: 'SocketIoStub' })
  const wss = new WebSocketServer({ noServer: true })
  const pollSessions = new Map<string, PollSession>()

  const owns = (pathname: string): boolean => pathname === '/socket.io' || pathname.startsWith('/socket.io/')

  // ---- WebSocket transport (the one the client actually uses) ----
  const onWsConnection = (ws: WebSocket): void => {
    const sid = randomBytes(12).toString('base64url')
    const safeSend = (data: string) => {
      try {
        ws.send(data)
      } catch {
        /* socket gone */
      }
    }
    safeSend(openPacket(sid)) // Engine.IO OPEN
    const ping = setInterval(() => safeSend('2'), PING_INTERVAL_MS) // server heartbeat
    ping.unref?.()

    ws.on('message', (raw) => {
      const msg = raw.toString()
      if (msg === '3') return // client PONG
      if (msg === '2') return void safeSend('3') // client PING (rare in v4)
      if (msg.startsWith('40')) return void safeSend(`40${JSON.stringify({ sid })}`) // CONNECT → ack
      if (msg === '1' || msg.startsWith('41')) {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      }
    })
    const cleanup = () => clearInterval(ping)
    ws.on('close', cleanup)
    ws.on('error', cleanup)
    log.debug({ sid }, 'Accepted dead app-channel socket (ws)')
  }

  // ---- HTTP long-poll transport (fallback; usually unused) ----
  const endText = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=UTF-8' })
    res.end(body)
  }
  const flush = (session: PollSession): void => {
    if (!session.poll || session.outbox.length === 0) return
    clearTimeout(session.poll.timer)
    const payload = session.outbox.join(RS)
    session.outbox = []
    const { res } = session.poll
    session.poll = null
    endText(res, 200, payload)
  }
  const holdPoll = (session: PollSession, res: ServerResponse): void => {
    const timer = setTimeout(() => {
      if (session.poll?.res === res) {
        session.poll = null
        endText(res, 200, '2')
      }
    }, PING_INTERVAL_MS)
    timer.unref?.()
    session.poll = { res, timer }
    res.on('close', () => {
      if (session.poll?.res === res) {
        clearTimeout(session.poll.timer)
        session.poll = null
      }
    })
  }
  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size <= 64 * 1024) chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', () => resolve(''))
    })

  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [sid, s] of pollSessions) {
      if (now - s.lastSeen > SESSION_TTL_MS) {
        if (s.poll) {
          clearTimeout(s.poll.timer)
          try {
            s.poll.res.end()
          } catch {
            /* ignore */
          }
        }
        pollSessions.delete(sid)
      }
    }
  }, PING_INTERVAL_MS)
  sweep.unref?.()

  return {
    owns,

    handleHttp(req, res, pathname, query): boolean {
      if (!owns(pathname)) return false
      const method = req.method ?? 'GET'
      const sid = query.get('sid') ?? ''

      if (method === 'GET' && !sid) {
        const newSid = randomBytes(12).toString('base64url')
        pollSessions.set(newSid, { outbox: [], poll: null, lastSeen: Date.now() })
        endText(res, 200, openPacket(newSid))
        return true
      }
      const session = sid ? pollSessions.get(sid) : undefined
      if (!session) {
        endText(res, 400, '{"code":1,"message":"Session ID unknown"}')
        return true
      }
      session.lastSeen = Date.now()
      if (method === 'GET') {
        if (session.outbox.length > 0) {
          const payload = session.outbox.join(RS)
          session.outbox = []
          endText(res, 200, payload)
        } else {
          holdPoll(session, res)
        }
        return true
      }
      if (method === 'POST') {
        void readBody(req).then((body) => {
          if (body.includes('40')) {
            session.outbox.push(`40${JSON.stringify({ sid })}`)
            flush(session)
          }
          endText(res, 200, 'ok')
        })
        return true
      }
      endText(res, 200, 'ok')
      return true
    },

    handleUpgrade(req, socket, head, pathname): boolean {
      if (!owns(pathname)) return false
      wss.handleUpgrade(req, socket, head, (ws) => onWsConnection(ws))
      return true
    },

    close(): void {
      clearInterval(sweep)
      for (const s of pollSessions.values()) {
        if (s.poll) {
          clearTimeout(s.poll.timer)
          try {
            s.poll.res.end()
          } catch {
            /* ignore */
          }
        }
      }
      pollSessions.clear()
      try {
        for (const client of wss.clients) client.terminate()
        wss.close()
      } catch {
        /* ignore */
      }
    },
  }
}
