import type { Socket } from 'socket.io'
import type { DocumentShareResolver } from './document-share-resolver.js'
import { getErrorLogContext } from './error-utils.js'
import { bindLoggerContext, type Logger } from './logger.js'
import { getContextSentryExtra, type OperationContext } from './operation-context.js'
import type { SocketTokenVerifier } from './socket-token-verifier.js'
import {
  SOCKET_EVENT_AWARENESS,
  SOCKET_EVENT_AWARENESS_SUBSCRIPTION,
  SOCKET_EVENT_CREATE_NOTE_BUNDLE,
  SOCKET_EVENT_UPDATE,
} from './protocol.js'
import { RoomManager } from './room-manager.js'
import {
  type AttachSocketOptions,
  type ClientKind,
  type CreateNoteBundlePayload,
  type InitializeRoomOptions,
  type SocketCapabilities,
  type WorkspaceAwarenessSubscriptionPayload,
  type WorkspaceDocEnvelope,
  type WorkspaceRoomType,
} from './room-types.js'
import { captureException } from './sentry.js'

function isWorkspaceDocEnvelope(value: unknown): value is WorkspaceDocEnvelope {
  const payload = value as {
    docId?: unknown
    generation?: unknown
    kind?: unknown
    update?: unknown
  }

  return (
    typeof value === 'object' &&
    value !== null &&
    typeof payload.docId === 'string' &&
    Number.isSafeInteger(payload.generation) &&
    (payload.kind === 'root' || payload.kind === 'note') &&
    payload.update instanceof Uint8Array
  )
}

function isWorkspaceAwarenessSubscriptionPayload(value: unknown): value is WorkspaceAwarenessSubscriptionPayload {
  const payload = value as { action?: unknown; docId?: unknown; kind?: unknown }

  return (
    typeof value === 'object' &&
    value !== null &&
    typeof payload.docId === 'string' &&
    (payload.kind === 'root' || payload.kind === 'note') &&
    (payload.action === 'subscribe' || payload.action === 'unsubscribe')
  )
}

function isCreateNoteBundlePayload(value: unknown): value is CreateNoteBundlePayload {
  const payload = value as {
    notes?: unknown
    rootUpdate?: unknown
  }

  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(payload.notes) &&
    payload.notes.length > 0 &&
    payload.notes.every(
      (note) =>
        typeof note === 'object' &&
        note !== null &&
        typeof (note as { noteId?: unknown }).noteId === 'string' &&
        ((note as { noteKind?: unknown }).noteKind === 'blockNote' ||
          (note as { noteKind?: unknown }).noteKind === 'stickyNote') &&
        (note as { noteSnapshot?: unknown }).noteSnapshot instanceof Uint8Array
    ) &&
    payload.rootUpdate instanceof Uint8Array
  )
}

interface QueuedEventHandlerOptions<T> {
  getRoom: () => Awaited<ReturnType<RoomManager['getRoom']>> | null
  isReady: () => boolean
  isValid: (payload: unknown) => payload is T
  onError: (payload: T, error: unknown) => void
  onReady: (room: Awaited<ReturnType<RoomManager['getRoom']>>, payload: T) => void | Promise<void>
  pending: T[]
  socket: Socket
}

export function createSocketOperationContext(logger: Logger, socket: Socket): OperationContext {
  const correlationId = resolveSocketCorrelationId(socket)

  return {
    correlationId,
    logger: bindLoggerContext(logger, { correlationId, socketId: socket.id }),
  }
}

export async function handleSocketConnection(
  socket: Socket,
  roomManager: RoomManager,
  documentShareResolver: DocumentShareResolver,
  tokenVerifier: SocketTokenVerifier,
  logger: Logger
): Promise<void> {
  const socketContext = createSocketOperationContext(logger, socket)
  const socketLogger = socketContext.logger ?? logger
  const workspaceId = resolveWorkspaceId(socket)
  if (!workspaceId) {
    socketLogger.warn(
      {
        hasCorrelationId: Boolean(socketContext.correlationId),
        remoteAddress: getSocketRemoteAddress(socket),
        socketId: socket.id,
      },
      'Rejecting socket connection without workspaceId'
    )
    socket.disconnect(true)
    return
  }

  const roomType = resolveRoomType(socket)
  const noteId = roomType === 'note' ? resolveNoteId(socket) : null
  const longHashId = resolveLongHashId(socket)
  const clientKind = resolveClientKind(socket)
  const initializeOptions: InitializeRoomOptions = {
    skipBootstrapValidation: resolveSkipBootstrapValidation(socket),
  }
  if (roomType === 'note' && !noteId) {
    socketLogger.warn(
      {
        hasCorrelationId: Boolean(socketContext.correlationId),
        remoteAddress: getSocketRemoteAddress(socket),
        roomType,
        socketId: socket.id,
        workspaceId,
      },
      'Rejecting note room socket connection without noteId'
    )
    socket.disconnect(true)
    return
  }

  const workspaceContext = {
    correlationId: socketContext.correlationId,
    logger: bindLoggerContext(socketLogger, {
      clientKind,
      hasSharedLink: longHashId !== null,
      noteId: noteId ?? undefined,
      roomType,
      workspaceId,
    }),
  } satisfies OperationContext

  let socketCapabilities: SocketCapabilities = {
    accessMode: 'editable',
    isSharedLink: false,
  }

  if (!longHashId) {
    const socketToken = resolveHandshakeStringValue(socket, 'socketToken')
    if (!socketToken) {
      workspaceContext.logger?.warn(
        {
          reason: 'no_auth',
          remoteAddress: getSocketRemoteAddress(socket),
          socketId: socket.id,
          workspaceId,
        },
        'Rejecting socket connection without socketToken or longHashId'
      )
      socket.disconnect(true)
      return
    }

    const verification = tokenVerifier.verify(socketToken, workspaceId)
    if (!verification.ok) {
      const logPayload = {
        reason: verification.reason,
        remoteAddress: getSocketRemoteAddress(socket),
        socketId: socket.id,
        workspaceId,
      }
      if (verification.reason === 'expired') {
        workspaceContext.logger?.info(logPayload, 'Rejecting socket connection with invalid token')
      } else {
        workspaceContext.logger?.warn(logPayload, 'Rejecting socket connection with invalid token')
      }
      socket.disconnect(true)
      return
    }

    socketCapabilities = {
      accessMode: verification.claims.mode,
      isSharedLink: false,
    }
  }

  if (longHashId) {
    if (roomType !== 'note' || !noteId) {
      socketLogger.warn(
        {
          hasCorrelationId: Boolean(socketContext.correlationId),
          remoteAddress: getSocketRemoteAddress(socket),
          roomType,
          socketId: socket.id,
          workspaceId,
        },
        'Rejecting shared-link socket connection outside dedicated note room'
      )
      socket.disconnect(true)
      return
    }

    if (!documentShareResolver.enabled) {
      workspaceContext.logger?.warn(
        {
          noteId,
          remoteAddress: getSocketRemoteAddress(socket),
          roomType,
          socketId: socket.id,
          workspaceId,
        },
        'Rejecting shared-link socket connection because backend share resolution is unavailable'
      )
      socket.disconnect(true)
      return
    }

    const shareAccess = await documentShareResolver.resolveSocketAccess(longHashId, workspaceContext)

    if (shareAccess.status !== 'active') {
      workspaceContext.logger?.warn(
        {
          noteId,
          remoteAddress: getSocketRemoteAddress(socket),
          roomType,
          shareStatus: shareAccess.status,
          socketId: socket.id,
          workspaceId,
        },
        'Rejecting shared-link socket connection for inactive share'
      )
      socket.disconnect(true)
      return
    }

    if (shareAccess.workspaceId !== workspaceId || shareAccess.noteId !== noteId) {
      workspaceContext.logger?.warn(
        {
          noteId,
          remoteAddress: getSocketRemoteAddress(socket),
          resolvedNoteId: shareAccess.noteId,
          resolvedWorkspaceId: shareAccess.workspaceId,
          roomType,
          socketId: socket.id,
          workspaceId,
        },
        'Rejecting shared-link socket connection with mismatched workspace or note'
      )
      socket.disconnect(true)
      return
    }

    socketCapabilities = {
      accessMode: shareAccess.accessMode,
      isSharedLink: true,
    }
  }

  let room: Awaited<ReturnType<RoomManager['getRoom']>> | null = null
  let attached = false
  const pendingUpdates: WorkspaceDocEnvelope[] = []
  const pendingCreateNoteBundles: CreateNoteBundlePayload[] = []
  const pendingAwarenessSubscriptions: WorkspaceAwarenessSubscriptionPayload[] = []
  const pendingAwarenessUpdates: WorkspaceDocEnvelope[] = []

  const dispatchUpdate = (
    nextRoom: Awaited<ReturnType<RoomManager['getRoom']>>,
    payload: WorkspaceDocEnvelope
  ): void => {
    nextRoom.handleUpdate(socket, payload)
  }

  const dispatchAwareness = (
    nextRoom: Awaited<ReturnType<RoomManager['getRoom']>>,
    payload: WorkspaceDocEnvelope
  ): void => {
    nextRoom.handleAwarenessUpdate(socket, payload)
  }

  const dispatchAwarenessSubscription = (
    nextRoom: Awaited<ReturnType<RoomManager['getRoom']>>,
    payload: WorkspaceAwarenessSubscriptionPayload
  ): void => {
    nextRoom.handleAwarenessSubscription(socket, payload)
  }

  const dispatchCreateNoteBundle = (
    nextRoom: Awaited<ReturnType<RoomManager['getRoom']>>,
    payload: CreateNoteBundlePayload
  ): void => {
    nextRoom.handleCreateNoteBundle(socket, payload)
  }

  const handleUpdate = createQueuedEventHandler({
    getRoom: () => room,
    isReady: () => attached,
    isValid: isWorkspaceDocEnvelope,
    onError: (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_update_event', error, {
        docId: payload.docId,
        payloadSize: payload.update.byteLength,
        workspaceId,
      })
    },
    onReady: dispatchUpdate,
    pending: pendingUpdates,
    socket,
  })

  const handleAwareness = createQueuedEventHandler({
    getRoom: () => room,
    isReady: () => attached,
    isValid: isWorkspaceDocEnvelope,
    onError: (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_awareness_event', error, {
        docId: payload.docId,
        payloadSize: payload.update.byteLength,
        workspaceId,
      })
    },
    onReady: dispatchAwareness,
    pending: pendingAwarenessUpdates,
    socket,
  })

  const handleAwarenessSubscription = createQueuedEventHandler({
    getRoom: () => room,
    isReady: () => attached,
    isValid: isWorkspaceAwarenessSubscriptionPayload,
    onError: (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_awareness_subscription_event', error, {
        action: payload.action,
        docId: payload.docId,
        workspaceId,
      })
    },
    onReady: dispatchAwarenessSubscription,
    pending: pendingAwarenessSubscriptions,
    socket,
  })

  const handleCreateNoteBundle = createQueuedEventHandler({
    getRoom: () => room,
    isReady: () => attached,
    isValid: isCreateNoteBundlePayload,
    onError: (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_create_note_bundle_event', error, {
        noteCount: payload.notes.length,
        noteIds: payload.notes.map((note) => note.noteId),
        noteSnapshotSize: payload.notes.reduce((size, note) => size + note.noteSnapshot.byteLength, 0),
        rootUpdateSize: payload.rootUpdate.byteLength,
        workspaceId,
      })
    },
    onReady: dispatchCreateNoteBundle,
    pending: pendingCreateNoteBundles,
    socket,
  })

  const handleDisconnect = (reason: string) => {
    if (!room) {
      socketLogger.info(
        {
          noteId: noteId ?? undefined,
          reason,
          remoteAddress: getSocketRemoteAddress(socket),
          roomType,
          socketId: socket.id,
          workspaceId,
        },
        'Socket disconnected before workspace room became ready'
      )
      return
    }

    room.detachSocket(socket.id)
    workspaceContext.logger?.info(
      {
        connectionCount: room.connectionCount,
        noteId: noteId ?? undefined,
        reason,
        remoteAddress: getSocketRemoteAddress(socket),
        roomType,
        socketId: socket.id,
        workspaceId,
      },
      'Socket disconnected from workspace room'
    )
    void roomManager.destroyRoomIfEmpty(workspaceId, room, workspaceContext).catch((error) => {
      workspaceContext.logger?.error(
        { ...getErrorLogContext(error), socketId: socket.id, workspaceId },
        'Failed to destroy empty room after disconnect'
      )
      captureException(error, {
        ...getContextSentryExtra(workspaceContext),
        socketId: socket.id,
        stage: 'destroy_after_disconnect',
        workspaceId,
      })
    })
  }

  socket.on(SOCKET_EVENT_UPDATE, handleUpdate)
  socket.on(SOCKET_EVENT_CREATE_NOTE_BUNDLE, handleCreateNoteBundle)
  socket.on(SOCKET_EVENT_AWARENESS, handleAwareness)
  socket.on(SOCKET_EVENT_AWARENESS_SUBSCRIPTION, handleAwarenessSubscription)
  socket.on('disconnect', handleDisconnect)

  try {
    room = await roomManager.getRoom(workspaceId, initializeOptions, workspaceContext)
  } catch (error) {
    workspaceContext.logger?.error(
      { ...getErrorLogContext(error), socketId: socket.id, workspaceId },
      'Failed to initialize room for socket connection'
    )
    captureException(error, {
      ...getContextSentryExtra(workspaceContext),
      socketId: socket.id,
      stage: 'room_initialize',
      workspaceId,
    })
    socket.disconnect(true)
    return
  }

  if (socket.disconnected) {
    await roomManager.destroyRoomIfEmpty(workspaceId, room, workspaceContext).catch((error) => {
      workspaceContext.logger?.error(
        { ...getErrorLogContext(error), socketId: socket.id, workspaceId },
        'Failed to destroy disconnected room during socket setup'
      )
      captureException(error, {
        ...getContextSentryExtra(workspaceContext),
        socketId: socket.id,
        stage: 'destroy_during_socket_setup',
        workspaceId,
      })
    })
    return
  }

  const attachOptions: AttachSocketOptions =
    roomType === 'workspace'
      ? {
          capabilities: socketCapabilities,
          clientKind,
          roomType: 'workspace',
          skipBootstrapValidation: initializeOptions.skipBootstrapValidation,
        }
      : {
          capabilities: socketCapabilities,
          clientKind,
          roomType: 'note',
          noteId: noteId as string,
          skipBootstrapValidation: initializeOptions.skipBootstrapValidation,
        }

  await room.attachSocket(socket, attachOptions, workspaceContext)
  attached = true

  if (socket.disconnected) {
    await roomManager.destroyRoomIfEmpty(workspaceId, room, workspaceContext).catch((error) => {
      workspaceContext.logger?.error(
        { ...getErrorLogContext(error), socketId: socket.id, workspaceId },
        'Failed to destroy disconnected room after socket attachment'
      )
      captureException(error, {
        ...getContextSentryExtra(workspaceContext),
        socketId: socket.id,
        stage: 'destroy_after_socket_attach',
        workspaceId,
      })
    })
    return
  }

  if (
    !(await drainQueuedPayloads(room, pendingCreateNoteBundles, dispatchCreateNoteBundle, (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_create_note_bundle_event', error, {
        noteCount: payload.notes.length,
        noteIds: payload.notes.map((note) => note.noteId),
        noteSnapshotSize: payload.notes.reduce((size, note) => size + note.noteSnapshot.byteLength, 0),
        rootUpdateSize: payload.rootUpdate.byteLength,
        workspaceId,
      })
    }))
  ) {
    return
  }

  if (
    !(await drainQueuedPayloads(room, pendingUpdates, dispatchUpdate, (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_update_event', error, {
        docId: payload.docId,
        payloadSize: payload.update.byteLength,
        workspaceId,
      })
    }))
  ) {
    return
  }

  if (
    !(await drainQueuedPayloads(
      room,
      pendingAwarenessSubscriptions,
      dispatchAwarenessSubscription,
      (payload, error) => {
        handleSocketEventError(workspaceContext, socket, 'socket_awareness_subscription_event', error, {
          action: payload.action,
          docId: payload.docId,
          workspaceId,
        })
      }
    ))
  ) {
    return
  }

  if (
    !(await drainQueuedPayloads(room, pendingAwarenessUpdates, dispatchAwareness, (payload, error) => {
      handleSocketEventError(workspaceContext, socket, 'socket_awareness_event', error, {
        docId: payload.docId,
        payloadSize: payload.update.byteLength,
        workspaceId,
      })
    }))
  ) {
    return
  }

  workspaceContext.logger?.info(
    {
      connectionCount: room.connectionCount,
      noteId: noteId ?? undefined,
      pendingAwarenessSubscriptionCount: pendingAwarenessSubscriptions.length,
      pendingAwarenessMessageCount: pendingAwarenessUpdates.length,
      pendingUpdateCount: pendingUpdates.length,
      clientKind,
      remoteAddress: getSocketRemoteAddress(socket),
      roomType,
      socketAccessMode: socketCapabilities.accessMode,
      socketId: socket.id,
      usingSharedLink: socketCapabilities.isSharedLink,
      workspaceId,
    },
    'Accepted workspace socket connection'
  )
}

function createQueuedEventHandler<T>(options: QueuedEventHandlerOptions<T>): (payload: unknown) => void {
  return (payload: unknown) => {
    if (!options.isValid(payload)) {
      options.socket.disconnect(true)
      return
    }

    const room = options.getRoom()
    if (!room || !options.isReady()) {
      options.pending.push(payload)
      return
    }

    void Promise.resolve(options.onReady(room, payload)).catch((error) => {
      options.onError(payload, error)
    })
  }
}

async function drainQueuedPayloads<T>(
  room: Awaited<ReturnType<RoomManager['getRoom']>>,
  payloads: T[],
  onReady: (room: Awaited<ReturnType<RoomManager['getRoom']>>, payload: T) => void | Promise<void>,
  onError: (payload: T, error: unknown) => void
): Promise<boolean> {
  for (const payload of payloads) {
    try {
      await onReady(room, payload)
    } catch (error) {
      onError(payload, error)
      return false
    }
  }

  return true
}

function resolveWorkspaceId(socket: Socket): string | null {
  return resolveHandshakeStringValue(socket, 'workspaceId')
}

function resolveNoteId(socket: Socket): string | null {
  return resolveHandshakeStringValue(socket, 'noteId')
}

function resolveLongHashId(socket: Socket): string | null {
  return resolveHandshakeStringValue(socket, 'longHashId')
}

function resolveSocketCorrelationId(socket: Socket): string | undefined {
  return resolveHandshakeStringValue(socket, 'correlationId') ?? undefined
}

function resolveSkipBootstrapValidation(socket: Socket): boolean {
  return resolveHandshakeBooleanValue(socket, 'skipBootstrapValidation')
}

function resolveClientKind(socket: Socket): ClientKind {
  const value = resolveHandshakeStringValue(socket, 'clientKind')
  if (value === 'frontend' || value === 'execenv' || value === 'cli') {
    return value
  }

  return 'unknown'
}

function resolveRoomType(socket: Socket): WorkspaceRoomType {
  const authValue = socket.handshake.auth.roomType
  if (authValue === 'note') {
    return 'note'
  }

  const queryValue = socket.handshake.query.roomType
  if (queryValue === 'note') {
    return 'note'
  }

  return 'workspace'
}

function resolveHandshakeStringValue(
  socket: Socket,
  key: 'workspaceId' | 'correlationId' | 'noteId' | 'longHashId' | 'clientKind' | 'socketToken'
): string | null {
  const authValue = socket.handshake.auth[key]
  if (typeof authValue === 'string' && authValue.length > 0) {
    return authValue
  }

  const queryValue = socket.handshake.query[key]
  if (typeof queryValue === 'string' && queryValue.length > 0) {
    return queryValue
  }

  if (Array.isArray(queryValue) && typeof queryValue[0] === 'string' && queryValue[0].length > 0) {
    return queryValue[0]
  }

  return null
}

function resolveHandshakeBooleanValue(socket: Socket, key: 'skipBootstrapValidation'): boolean {
  const authValue = socket.handshake.auth[key]
  if (typeof authValue === 'boolean') {
    return authValue
  }

  if (typeof authValue === 'string') {
    return authValue === 'true'
  }

  const queryValue = socket.handshake.query[key]
  if (typeof queryValue === 'boolean') {
    return queryValue
  }

  if (typeof queryValue === 'string') {
    return queryValue === 'true'
  }

  if (Array.isArray(queryValue) && typeof queryValue[0] === 'string') {
    return queryValue[0] === 'true'
  }

  return false
}

function getSocketRemoteAddress(socket: Socket): string | undefined {
  const address = socket.handshake.address || socket.conn.remoteAddress
  return typeof address === 'string' && address.length > 0 ? address : undefined
}

function handleSocketEventError(
  context: OperationContext,
  socket: Socket,
  stage: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  context.logger?.error(
    {
      ...getErrorLogContext(error),
      socketId: socket.id,
      ...extra,
    },
    'Socket event handler failed'
  )
  captureException(error, {
    ...getContextSentryExtra(context),
    socketId: socket.id,
    stage,
    ...extra,
  })
  socket.disconnect(true)
}
