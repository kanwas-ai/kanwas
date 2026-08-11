import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { appendError, getErrorLogContext, throwAggregateErrors } from './error-utils.js'
import type { DocumentStore } from './document-store.js'
import type { Logger } from './logger.js'
import { RoomManager } from './room-manager.js'
import { createSocketOperationContext, handleSocketConnection } from './socket-connection.js'
import { SocketTokenVerifier } from './socket-token-verifier.js'

export interface AttachYjsCoreOptions {
  /** Existing loopback HTTP server owned by the embedding application. */
  httpServer: HttpServer
  logger: Logger
  store: DocumentStore
  /** Per-process HMAC secret used to verify workspace-scoped socket tokens. */
  tokenSecret: string
  saveDebounceMs?: number
  saveMaxWaitMs?: number
  socketPath?: string
  /** When set, browser sockets must come from this exact loopback origin. */
  allowedOrigin?: string
  socketPingIntervalMs?: number
  socketPingTimeoutMs?: number
}

export interface YjsCoreHandle {
  readonly io: SocketIOServer
  readonly roomManager: RoomManager
  /** Flushes and destroys rooms and closes Socket.IO without closing the HTTP server. */
  close(): Promise<void>
}

/**
 * Attach the Yjs workspace protocol to an application-owned HTTP server.
 * The caller remains responsible for listening on and closing that server.
 */
export function attachYjsCore(options: AttachYjsCoreOptions): YjsCoreHandle {
  const tokenVerifier = new SocketTokenVerifier(options.tokenSecret)
  const roomManager = new RoomManager({
    logger: options.logger,
    saveDebounceMs: options.saveDebounceMs ?? 1_000,
    saveMaxWaitMs: options.saveMaxWaitMs ?? 5_000,
    store: options.store,
  })
  const io = new SocketIOServer(options.httpServer, {
    allowUpgrades: false,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin
      const allowedHost = options.allowedOrigin ? new URL(options.allowedOrigin).host : undefined
      const hostMatches = !allowedHost || request.headers.host === allowedHost
      const originMatches = !options.allowedOrigin || origin === undefined || origin === options.allowedOrigin
      callback(null, hostMatches && originMatches)
    },
    path: options.socketPath ?? '/yjs/socket.io',
    perMessageDeflate: false,
    pingInterval: options.socketPingIntervalMs ?? 10_000,
    pingTimeout: options.socketPingTimeoutMs ?? 5_000,
    serveClient: false,
    transports: ['websocket'],
  })

  io.on('connection', (socket) => {
    const context = createSocketOperationContext(options.logger, socket)

    void handleSocketConnection(socket, roomManager, tokenVerifier, options.logger).catch((error) => {
      context.logger?.error(
        { ...getErrorLogContext(error), socketId: socket.id },
        'Unhandled socket connection failure'
      )
      socket.disconnect(true)
    })
  })

  let closeTask: Promise<void> | null = null

  return {
    io,
    roomManager,
    close() {
      if (closeTask) {
        return closeTask
      }

      closeTask = (async () => {
        const errors: unknown[] = []

        try {
          io.removeAllListeners('connection')
          io.disconnectSockets(true)
        } catch (error) {
          appendError(errors, error)
        }

        try {
          await roomManager.shutdown()
        } catch (error) {
          appendError(errors, error)
        }

        // Socket.IO's public close() also closes an attached HTTP server. The
        // embedded core does not own that server, so close Engine.IO directly.
        try {
          io.engine.close()
        } catch (error) {
          appendError(errors, error)
        }

        throwAggregateErrors(errors, 'Failed to close the embedded Yjs core cleanly')
      })()

      return closeTask
    },
  }
}

export type { DocumentStore } from './document-store.js'
export type { LogContext, Logger } from './logger.js'
export { noopLogger } from './logger.js'
export { RoomManager } from './room-manager.js'
export type { ReplaceDocumentOptions, WorkspaceSnapshotBundle } from './room.js'
export {
  SocketTokenVerifier,
  type SocketTokenAccessMode,
  type SocketTokenClaims,
  type SocketTokenRejectionReason,
  type SocketTokenVerifyResult,
} from './socket-token-verifier.js'
