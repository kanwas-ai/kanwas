import { createServer } from 'node:http'
import { once } from 'node:events'
import { Server as SocketIOServer } from 'socket.io'
import type { BackendNotifier } from './backend-notifier.js'
import { DisabledDocumentShareResolver, type DocumentShareResolver } from './document-share-resolver.js'
import { getErrorLogContext } from './error-utils.js'
import { createHttpOperationContext, handleHttpRequest } from './http-request-handler.js'
import type { Logger } from './logger.js'
import { getContextSentryExtra } from './operation-context.js'
import { RoomManager } from './room-manager.js'
import { captureException } from './sentry.js'
import { createSocketOperationContext, handleSocketConnection } from './socket-connection.js'
import { SocketTokenVerifier } from './socket-token-verifier.js'
import type { DocumentStore } from './storage.js'

export interface CreateYjsServerOptions {
  adminSecret: string
  backendNotifier: BackendNotifier
  documentShareResolver?: DocumentShareResolver
  host?: string
  logger: Logger
  port: number
  saveDebounceMs: number
  socketPingIntervalMs: number
  socketPingTimeoutMs: number
  socketPath?: string
  store: DocumentStore
}

export interface RunningYjsServer {
  close(): Promise<void>
  httpServer: ReturnType<typeof createServer>
  io: SocketIOServer
  roomManager: RoomManager
}

export async function startYjsServer(options: CreateYjsServerOptions): Promise<RunningYjsServer> {
  const documentShareResolver = options.documentShareResolver ?? new DisabledDocumentShareResolver()
  const socketTokenVerifier = new SocketTokenVerifier(options.adminSecret)
  const roomManager = new RoomManager({
    backendNotifier: options.backendNotifier,
    logger: options.logger,
    saveDebounceMs: options.saveDebounceMs,
    store: options.store,
  })

  const httpServer = createServer((request, response) => {
    const requestContext = createHttpOperationContext(options.logger, request)

    void handleHttpRequest(request, response, roomManager, {
      adminSecret: options.adminSecret,
      logger: options.logger,
    }).catch((error) => {
      requestContext.logger?.error(
        { ...getErrorLogContext(error), path: request.url ?? '/' },
        'Unhandled HTTP request failure'
      )
      captureException(error, {
        ...getContextSentryExtra(requestContext),
        path: request.url ?? '/',
        stage: 'http_request',
      })

      if (!response.headersSent) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal server error',
          })
        )
      }
    })
  })

  const io = new SocketIOServer(httpServer, {
    allowUpgrades: false,
    cors: { credentials: true, origin: true },
    path: options.socketPath,
    perMessageDeflate: false,
    pingInterval: options.socketPingIntervalMs,
    pingTimeout: options.socketPingTimeoutMs,
    transports: ['websocket'],
  })

  io.on('connection', (socket) => {
    const socketContext = createSocketOperationContext(options.logger, socket)

    void handleSocketConnection(socket, roomManager, documentShareResolver, socketTokenVerifier, options.logger).catch(
      (error) => {
        socketContext.logger?.error(
          { ...getErrorLogContext(error), socketId: socket.id },
          'Unhandled socket connection failure'
        )
        captureException(error, {
          ...getContextSentryExtra(socketContext),
          socketId: socket.id,
          stage: 'socket_connection',
        })
        socket.disconnect(true)
      }
    )
  })

  httpServer.listen(options.port, options.host ?? '0.0.0.0')
  await once(httpServer, 'listening')

  return {
    httpServer,
    io,
    roomManager,
    async close() {
      io.close()
      await roomManager.shutdown()
      httpServer.close()
      await once(httpServer, 'close')
    },
  }
}
