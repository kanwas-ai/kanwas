import { type IncomingMessage, type ServerResponse } from 'node:http'
import { bindLoggerContext, type Logger } from './logger.js'
import { type OperationContext, getContextSentryExtra } from './operation-context.js'
import { type PersistenceStage } from './protocol.js'
import { RoomManager } from './room-manager.js'
import { type WorkspaceSnapshotBundle } from './room-types.js'
import { captureException } from './sentry.js'
import { getErrorLogContext } from './error-utils.js'

interface AuthorizedRequest {
  notifyBackend: boolean
  reason: string
  stage: Extract<PersistenceStage, 'replace'>
  workspaceId: string
}

export function createHttpOperationContext(logger: Logger, request: IncomingMessage): OperationContext {
  const correlationId = resolveHeaderCorrelationId(request)

  return {
    correlationId,
    logger: bindLoggerContext(logger, {
      correlationId,
      method: request.method,
      path: request.url ?? '/',
    }),
  }
}

export async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  roomManager: RoomManager,
  options: { adminSecret: string; logger: Logger }
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  const requestContext = createHttpOperationContext(options.logger, request)

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    respondJson(response, 200, {
      rooms: roomManager.activeRoomCount,
      status: 'ok',
    })
    return
  }

  if (request.method !== 'POST') {
    respondJson(response, 404, { error: 'Not found' })
    return
  }

  const authorizedRequest = parseAuthorizedRequest(requestUrl)
  if (!authorizedRequest) {
    respondJson(response, 404, { error: 'Not found' })
    return
  }

  const requestLogger = bindLoggerContext(requestContext.logger ?? options.logger, {
    stage: authorizedRequest.stage,
    workspaceId: authorizedRequest.workspaceId,
  })

  if (!isAuthorizedRequest(request, options.adminSecret)) {
    requestLogger.warn({ statusCode: 401 }, 'Rejected unauthorized HTTP document mutation')
    respondJson(response, 401, { error: 'Unauthorized' })
    return
  }

  let snapshot: WorkspaceSnapshotBundle
  try {
    snapshot = await readSnapshotBundleRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    requestLogger.warn(
      {
        notifyBackend: authorizedRequest.notifyBackend,
        reason: authorizedRequest.reason,
        stage: authorizedRequest.stage,
        statusCode: 400,
      },
      'Rejected HTTP document mutation without a valid payload'
    )
    respondJson(response, 400, { error: message })
    return
  }

  requestLogger.info(
    {
      notifyBackend: authorizedRequest.notifyBackend,
      noteCount: Object.keys(snapshot.notes).length,
      reason: authorizedRequest.reason,
    },
    'Applying HTTP workspace snapshot mutation'
  )

  try {
    const room = await roomManager.replaceDocument(
      authorizedRequest.workspaceId,
      snapshot,
      {
        notifyBackend: authorizedRequest.notifyBackend,
        reason: authorizedRequest.reason,
        stage: authorizedRequest.stage,
      },
      {
        correlationId: requestContext.correlationId,
        logger: requestLogger,
      }
    )

    respondJson(response, 200, { success: true })
    requestLogger.info(
      {
        connectionCount: room.connectionCount,
        noteCount: Object.keys(snapshot.notes).length,
        notifyBackend: authorizedRequest.notifyBackend,
        reason: authorizedRequest.reason,
      },
      'Applied HTTP workspace snapshot mutation'
    )

    if (room.connectionCount === 0) {
      const workspaceContext = {
        correlationId: requestContext.correlationId,
        logger: requestLogger,
      } satisfies OperationContext

      await roomManager.destroyRoomIfEmpty(authorizedRequest.workspaceId, room, workspaceContext).catch((error) => {
        workspaceContext.logger?.error(
          {
            ...getErrorLogContext(error),
            workspaceId: authorizedRequest.workspaceId,
          },
          'Failed to destroy replaced room after HTTP mutation'
        )
        captureException(error, {
          ...getContextSentryExtra(workspaceContext),
          stage: 'destroy_after_http_mutation',
          workspaceId: authorizedRequest.workspaceId,
        })
      })
    }
  } catch (error) {
    requestLogger.error(
      {
        ...getErrorLogContext(error),
        method: request.method,
        notifyBackend: authorizedRequest.notifyBackend,
        noteCount: Object.keys(snapshot.notes).length,
        path: requestUrl.pathname,
        reason: authorizedRequest.reason,
        stage: authorizedRequest.stage,
        workspaceId: authorizedRequest.workspaceId,
      },
      'Failed to apply HTTP workspace snapshot mutation'
    )
    captureException(error, {
      ...getContextSentryExtra(requestContext),
      method: request.method,
      notifyBackend: authorizedRequest.notifyBackend,
      noteCount: Object.keys(snapshot.notes).length,
      path: requestUrl.pathname,
      reason: authorizedRequest.reason,
      stage: authorizedRequest.stage,
      workspaceId: authorizedRequest.workspaceId,
    })
    respondJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function resolveHeaderCorrelationId(request: IncomingMessage): string | undefined {
  const header = request.headers['x-correlation-id']
  if (typeof header === 'string' && header.length > 0) {
    return header
  }

  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].length > 0) {
    return header[0]
  }

  return undefined
}

function parseAuthorizedRequest(requestUrl: URL): AuthorizedRequest | null {
  const match = requestUrl.pathname.match(/^\/documents\/([^/]+)\/replace$/)
  if (!match) {
    return null
  }

  const stage = 'replace' as Extract<PersistenceStage, 'replace'>

  return {
    notifyBackend: parseNotifyBackend(requestUrl.searchParams.get('notifyBackend')),
    reason: requestUrl.searchParams.get('reason') ?? 'replace',
    stage,
    workspaceId: match[1],
  }
}

function isAuthorizedRequest(request: IncomingMessage, adminSecret: string): boolean {
  return request.headers.authorization === `Bearer ${adminSecret}`
}

function parseNotifyBackend(value: string | null): boolean {
  if (value === null) {
    return true
  }

  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no'
}

async function readSnapshotBundleRequest(request: IncomingMessage): Promise<WorkspaceSnapshotBundle> {
  const body = await readBody(request)
  if (body.byteLength === 0) {
    throw new Error('Missing document payload')
  }

  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new Error('Expected application/json workspace snapshot bundle payload')
  }

  const parsed = JSON.parse(Buffer.from(body).toString('utf8')) as Partial<WorkspaceSnapshotBundle>
  if (!parsed || typeof parsed.root !== 'string' || typeof parsed.notes !== 'object' || parsed.notes === null) {
    throw new Error('Invalid workspace snapshot bundle payload')
  }

  return {
    notes: Object.fromEntries(
      Object.entries(parsed.notes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    ),
    root: parsed.root,
  }
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []

  for await (const chunk of request) {
    if (chunk instanceof Uint8Array) {
      chunks.push(chunk)
      continue
    }

    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
      continue
    }

    chunks.push(new Uint8Array(chunk))
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const body = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
}

function respondJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}
