import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness.js'
import type { Socket } from 'socket.io'
import { encodeBootstrapPayload } from 'shared'
import { CanvasTreeValidationError, assertValidWorkspaceRoot } from 'shared/canvas-tree'
import { ensureNoteDocInitialized } from 'shared/note-doc'
import type { BackendNotifier } from './backend-notifier.js'
import { getErrorLogContext } from './error-utils.js'
import { bindLoggerContext, type Logger } from './logger.js'
import { getContextLogger, getContextSentryExtra, type OperationContext } from './operation-context.js'
import {
  SOCKET_EVENT_AWARENESS,
  SOCKET_EVENT_BOOTSTRAP,
  SOCKET_EVENT_RELOAD,
  SOCKET_EVENT_UPDATE,
  type PersistenceStage,
} from './protocol.js'
import { createDocState } from './room-doc-state.js'
import { hydrateSnapshotBundle, type HydratedSnapshotBundle } from './room-snapshot.js'
import {
  type ClientKind,
  type CreateNoteBundlePayload,
  DEFAULT_SOCKET_CAPABILITIES,
  SIGNIFICANT_DOCUMENT_SHRINK_THRESHOLD,
  assertAttachedNoteDocReference,
  encodeBootstrapDoc,
  findWorkspaceNotesMap,
  getDocumentSize,
  isSocketDocOrigin,
  normalizeBinary,
  validateLoadedNoteDoc,
  type AttachSocketOptions,
  type DocState,
  type InitializeRoomOptions,
  type ReplaceDocumentOptions,
  type SocketSubscriptionState,
  type WorkspaceBootstrapDoc,
  type WorkspaceBootstrapPayload,
  type WorkspaceAwarenessSubscriptionPayload,
  type WorkspaceDocEnvelope,
  type WorkspaceDocKind,
  type WorkspaceDocRef,
  type WorkspaceRoomOptions,
  type WorkspaceSnapshotBundle,
} from './room-types.js'
import { captureException } from './sentry.js'
import type { DocumentStore } from './storage.js'

export type { AttachSocketOptions, ReplaceDocumentOptions, WorkspaceRoomOptions, WorkspaceSnapshotBundle }

export class WorkspaceRoom {
  private readonly sockets = new Map<string, Socket>()
  private readonly socketClientIds = new Map<string, Map<string, Set<number>>>()
  private readonly socketContexts = new Map<string, OperationContext>()
  private readonly socketClientKinds = new Map<string, ClientKind>()
  private readonly socketSubscriptions = new Map<string, SocketSubscriptionState>()
  private readonly store: DocumentStore
  private readonly backendNotifier: BackendNotifier
  private readonly saveDebounceMs: number
  private readonly log: Logger
  private readonly workspaceId: string

  private rootState: DocState
  private readonly noteStates = new Map<string, DocState>()
  private readonly noteGenerations = new Map<string, number>()
  private readonly noteLoadTasks = new Map<string, Promise<DocState>>()
  private initialized = false
  private initializeTask: Promise<void> | null = null
  private persistenceQueue: Promise<void> = Promise.resolve()
  private saveTimer: NodeJS.Timeout | null = null
  private blockedForReplacement = false
  private destroyed = false
  private rootGeneration = 1
  private rootDirty = false
  private dirtyNoteIds = new Set<string>()
  private deletedNoteIds = new Set<string>()
  private readonly suppressedDocOrigins = new WeakSet<object>()
  private currentRootSizeBytes: number
  private pendingPersistenceContext: OperationContext | undefined
  private pendingPersistenceSocketId: string | null = null
  private pendingPersistenceUpdateSizeBytes: number | undefined

  constructor(options: WorkspaceRoomOptions) {
    this.workspaceId = options.workspaceId
    this.store = options.store
    this.backendNotifier = options.backendNotifier
    this.saveDebounceMs = options.saveDebounceMs
    this.log = options.logger.child({ component: 'WorkspaceRoom', workspaceId: options.workspaceId })
    this.rootState = this.createRootState(new Y.Doc(), this.rootGeneration)
    this.currentRootSizeBytes = getDocumentSize(this.rootState.doc)
  }

  get connectionCount(): number {
    return this.sockets.size
  }

  get isInitialized(): boolean {
    return this.initialized
  }

  async initialize(options?: InitializeRoomOptions, context?: OperationContext): Promise<void> {
    if (this.initialized) {
      return
    }

    if (this.initializeTask) {
      return this.initializeTask
    }

    this.initializeTask = (async () => {
      const log = getContextLogger(this.log, context)
      log.debug({ connectionCount: this.connectionCount }, 'Loading workspace room root document from storage')

      const rootBytes = await this.store.loadRoot(this.workspaceId, context)
      const rootDoc = new Y.Doc()
      if (rootBytes && rootBytes.byteLength > 0) {
        Y.applyUpdateV2(rootDoc, rootBytes)
      }

      this.replaceWorkspaceState(rootDoc, options)
      this.initialized = true

      log.info(
        {
          connectionCount: this.connectionCount,
          docSize: rootBytes?.byteLength ?? 0,
          hadStoredDocument: rootBytes !== null,
          noteCount: this.noteStates.size,
        },
        'Initialized workspace room from storage'
      )
    })().finally(() => {
      this.initializeTask = null
    })

    return this.initializeTask
  }

  async attachSocket(socket: Socket, options: AttachSocketOptions, context?: OperationContext): Promise<void> {
    this.sockets.set(socket.id, socket)
    const capabilities = options.capabilities ?? DEFAULT_SOCKET_CAPABILITIES
    const clientKind = options.clientKind ?? 'unknown'
    const socketContext: OperationContext = {
      correlationId: context?.correlationId,
      logger: getContextLogger(bindLoggerContext(this.log, { clientKind, socketId: socket.id }), context),
    }
    this.socketContexts.set(socket.id, socketContext)
    this.socketClientKinds.set(socket.id, clientKind)

    if (!options.skipBootstrapValidation) {
      assertValidWorkspaceRoot(this.rootState.doc.getMap('state').get('root'))
    }

    if (options.roomType === 'workspace') {
      const noteIds = await this.loadAllNoteIds(context)
      const subscriptionState: SocketSubscriptionState = {
        awarenessDocIds: new Set(['root']),
        capabilities,
        roomType: 'workspace',
        docIds: new Set(['root', ...noteIds]),
      }
      this.socketSubscriptions.set(socket.id, subscriptionState)

      const docs: WorkspaceBootstrapDoc[] = [encodeBootstrapDoc(this.rootState)]
      for (const noteId of noteIds) {
        const noteState = this.noteStates.get(noteId)
        if (!noteState) {
          throw new Error(`Workspace ${this.workspaceId} is missing loaded note state ${noteId}`)
        }

        docs.push(encodeBootstrapDoc(noteState))
      }

      socket.emit(SOCKET_EVENT_BOOTSTRAP, encodeBootstrapPayload({ docs } satisfies WorkspaceBootstrapPayload))
      this.sendFullAwareness(socket, this.rootState)
      return
    }

    const noteState = await this.ensureNoteLoaded(options.noteId, context)
    const subscriptionState: SocketSubscriptionState = {
      awarenessDocIds: new Set([options.noteId]),
      capabilities,
      roomType: 'note',
      noteId: options.noteId,
      docIds: new Set([options.noteId]),
    }
    this.socketSubscriptions.set(socket.id, subscriptionState)

    socket.emit(
      SOCKET_EVENT_BOOTSTRAP,
      encodeBootstrapPayload({ docs: [encodeBootstrapDoc(noteState)] } satisfies WorkspaceBootstrapPayload)
    )
    this.sendFullAwareness(socket, noteState)
  }

  detachSocket(socketId: string): void {
    this.sockets.delete(socketId)
    const clientsByDoc = this.socketClientIds.get(socketId)
    if (clientsByDoc) {
      for (const [docId, clientIds] of clientsByDoc.entries()) {
        const docState = this.getDocState({ docId, kind: docId === 'root' ? 'root' : 'note' })
        if (docState && clientIds.size > 0) {
          removeAwarenessStates(docState.awareness, Array.from(clientIds), { docId, socketId })
        }
      }
    }

    this.socketClientIds.delete(socketId)
    this.socketContexts.delete(socketId)
    this.socketClientKinds.delete(socketId)
    this.socketSubscriptions.delete(socketId)
  }

  handleUpdate(socket: Socket, payload: WorkspaceDocEnvelope): void {
    this.handleSocketDocEnvelope(socket, payload, 'update', (docState, update) => {
      if (payload.kind === 'root') {
        this.applyValidatedRootUpdate(docState.doc, update, { docId: payload.docId, socketId: socket.id })
      } else {
        Y.applyUpdateV2(docState.doc, update, { docId: payload.docId, socketId: socket.id })
      }

      if (payload.kind === 'root') {
        this.syncAttachedNotes(socket.id)
      }
    })
  }

  handleCreateNoteBundle(socket: Socket, payload: CreateNoteBundlePayload): void {
    if (this.blockedForReplacement || this.destroyed) {
      return
    }

    const log = this.getSocketLogger(socket.id)

    try {
      const subscriptionState = this.requireWritableWorkspaceSubscription(socket.id)
      if (subscriptionState.capabilities.accessMode === 'readonly') {
        log.warn(
          {
            noteCount: payload.notes.length,
            noteIds: payload.notes.map((note) => note.noteId),
            noteSnapshotSize: payload.notes.reduce((size, note) => size + note.noteSnapshot.byteLength, 0),
            rootUpdateSize: payload.rootUpdate.byteLength,
            socketId: socket.id,
          },
          'Rejected readonly create-note bundle without disconnecting socket'
        )
        return
      }

      this.applyCreateNoteBundle(socket.id, payload)
    } catch (error) {
      if (error instanceof InvalidRootUpdateError) {
        return
      }

      log.warn(
        {
          ...getErrorLogContext(error),
          noteCount: payload.notes.length,
          noteIds: payload.notes.map((note) => note.noteId),
          noteSnapshotSize: payload.notes.reduce((size, note) => size + note.noteSnapshot.byteLength, 0),
          rootUpdateSize: payload.rootUpdate.byteLength,
          socketId: socket.id,
        },
        'Ignored invalid create-note bundle'
      )
    }
  }

  handleAwarenessUpdate(socket: Socket, payload: WorkspaceDocEnvelope): void {
    this.handleSocketDocEnvelope(socket, payload, 'awareness', (docState, update) => {
      applyAwarenessUpdate(docState.awareness, update, {
        docId: payload.docId,
        socketId: socket.id,
      })
    })
  }

  handleAwarenessSubscription(socket: Socket, payload: WorkspaceAwarenessSubscriptionPayload): void {
    if (this.blockedForReplacement || this.destroyed) {
      return
    }

    const log = this.getSocketLogger(socket.id)

    try {
      const subscriptionState = this.socketSubscriptions.get(socket.id)
      if (!subscriptionState) {
        throw new Error(`Socket ${socket.id} is not attached to workspace room ${this.workspaceId}`)
      }

      if (subscriptionState.roomType !== 'workspace') {
        throw new Error(
          `Socket ${socket.id} cannot change awareness subscriptions for room type ${subscriptionState.roomType}`
        )
      }

      if (payload.kind !== 'note') {
        throw new Error(`Workspace awareness subscriptions only support note docs, received ${payload.kind}`)
      }

      if (!subscriptionState.docIds.has(payload.docId)) {
        throw new Error(`Socket ${socket.id} is not subscribed to doc ${payload.docId}`)
      }

      const docState = this.getDocState(payload)
      if (!docState) {
        throw new Error(`Unknown doc ${payload.docId}`)
      }

      if (payload.action === 'subscribe') {
        if (subscriptionState.awarenessDocIds.has(payload.docId)) {
          return
        }

        subscriptionState.awarenessDocIds.add(payload.docId)
        this.sendFullAwareness(socket, docState)
        return
      }

      subscriptionState.awarenessDocIds.delete(payload.docId)
      this.clearTrackedSocketDocAwareness(socket.id, payload.docId, docState.awareness)
    } catch (error) {
      log.warn(
        {
          ...getErrorLogContext(error),
          action: payload.action,
          docId: payload.docId,
          socketId: socket.id,
        },
        'Ignored invalid awareness subscription change'
      )

      // Reconnect races can deliver stale note subscription changes after room state moved on.
      // Ignore the bad request so the rest of the session stays usable.
    }
  }

  async replaceDocument(
    snapshot: WorkspaceSnapshotBundle,
    options: ReplaceDocumentOptions,
    context?: OperationContext
  ): Promise<void> {
    if (this.destroyed) {
      throw new Error(`Workspace room ${this.workspaceId} has already been destroyed`)
    }

    if (this.initializeTask) {
      await this.initializeTask
    }

    this.clearSaveTimer()
    this.blockedForReplacement = true
    this.pendingPersistenceContext = context

    const log = getContextLogger(this.log, context)
    log.info(
      {
        connectionCount: this.connectionCount,
        noteCount: Object.keys(snapshot.notes).length,
        notifyBackend: options.notifyBackend,
        reason: options.reason,
        stage: options.stage,
      },
      'Applying workspace snapshot replacement'
    )

    try {
      const hydratedSnapshot = hydrateSnapshotBundle(snapshot)

      await this.enqueuePersistenceTask(async () => {
        await this.persistSnapshotBundle(hydratedSnapshot, options.stage, options.notifyBackend, context)
      })

      this.rootGeneration += 1
      this.replaceWorkspaceState(hydratedSnapshot.rootDoc)
      this.initialized = true
      this.broadcastReload(options.reason)
      this.disconnectAllSockets()

      log.info(
        { connectionCount: this.connectionCount, reason: options.reason, stage: options.stage },
        'Workspace snapshot replaced'
      )
    } finally {
      this.blockedForReplacement = false
    }
  }

  async flushAndDestroy(): Promise<void> {
    if (this.destroyed) {
      return
    }

    const connectionCount = this.connectionCount
    const docSize = this.currentRootSizeBytes

    this.clearSaveTimer()
    await this.flushPendingSave()
    await this.persistenceQueue

    this.teardownWorkspaceState()
    this.sockets.clear()
    this.socketClientIds.clear()
    this.socketContexts.clear()
    this.socketSubscriptions.clear()
    this.pendingPersistenceContext = undefined
    this.destroyed = true

    this.log.info({ connectionCount, docSize, noteCount: this.noteStates.size }, 'Destroyed workspace room')
  }

  private createRootState(doc: Y.Doc, generation: number): DocState {
    return createDocState({
      destroyDocOnTeardown: true,
      doc,
      generation,
      kind: 'root',
      loaded: true,
      onAwarenessUpdate: (changes, origin, rootState) => {
        this.handleAwarenessBroadcast(rootState, changes, origin)
      },
      onDocumentUpdate: (update, origin, rootState) => {
        if (origin === rootState.docOrigin || this.isSuppressedDocOrigin(origin)) {
          return
        }

        this.handleRootDocumentUpdate(rootState, update, isSocketDocOrigin(origin) ? origin.socketId : null)
      },
    })
  }

  private createNoteState(noteId: string, doc: Y.Doc): DocState {
    const { loaded, noteKind } = this.inspectAttachedNoteDoc(noteId, doc)
    const previousGeneration = this.noteGenerations.get(noteId) ?? 0
    const noteState = createDocState({
      doc,
      generation: previousGeneration > 0 ? previousGeneration + 1 : 1,
      kind: 'note',
      loaded,
      noteId,
      noteKind,
      onAwarenessUpdate: (changes, origin, state) => {
        this.handleAwarenessBroadcast(state, changes, origin)
      },
      onDocumentUpdate: (update, origin, state) => {
        if (origin === state.docOrigin || this.isSuppressedDocOrigin(origin)) {
          return
        }

        this.handleNoteDocumentUpdate(state, noteId, update, isSocketDocOrigin(origin) ? origin.socketId : null)
      },
    })

    this.noteGenerations.set(noteId, noteState.generation)
    return noteState
  }

  private rememberPendingPersistenceOrigin(originSocketId: string | null, updateSizeBytes: number): void {
    this.pendingPersistenceUpdateSizeBytes = updateSizeBytes
    if (!originSocketId) {
      return
    }

    this.pendingPersistenceSocketId = originSocketId
    this.pendingPersistenceContext = this.socketContexts.get(originSocketId) ?? {
      logger: bindLoggerContext(this.log, { socketId: originSocketId }),
    }
  }

  private replaceWorkspaceState(rootDoc: Y.Doc, options?: InitializeRoomOptions): void {
    if (!options?.skipBootstrapValidation) {
      assertValidWorkspaceRoot(rootDoc.getMap('state').get('root'))
    }
    this.teardownWorkspaceState()
    this.rootState = this.createRootState(rootDoc, this.rootGeneration)
    this.noteStates.clear()
    this.noteLoadTasks.clear()
    this.syncAttachedNotes()
    this.currentRootSizeBytes = getDocumentSize(rootDoc)
    this.rootDirty = false
    this.dirtyNoteIds.clear()
    this.deletedNoteIds.clear()
    this.pendingPersistenceContext = undefined
    this.pendingPersistenceSocketId = null
    this.pendingPersistenceUpdateSizeBytes = undefined
    this.socketClientKinds.clear()
    this.socketClientIds.clear()
  }

  private teardownWorkspaceState(): void {
    for (const noteState of this.noteStates.values()) {
      noteState.teardown()
    }
    this.noteStates.clear()
    this.noteLoadTasks.clear()
    this.rootState.teardown()
  }

  private applyValidatedRootUpdate(
    doc: Y.Doc,
    update: Uint8Array,
    origin: { docId: string; socketId: string },
    options: { allowedIntroducedNoteIds?: ReadonlySet<string>; requiredNoteIds?: ReadonlySet<string> } = {},
    sideEffects: 'immediate' | 'deferred' = 'immediate'
  ): () => void {
    const validationOrigin = this.createSuppressedDocOrigin()
    const undoManager = this.createUndoManager(doc, validationOrigin)
    try {
      const currentNoteIds = this.collectAttachedNoteIds(doc)
      Y.applyUpdateV2(doc, update, validationOrigin)
      assertValidWorkspaceRoot(doc.getMap('state').get('root'))
      this.assertAllowedIntroducedNoteIds(currentNoteIds, doc, options.allowedIntroducedNoteIds)
      if (options.requiredNoteIds) {
        const nextNoteIds = this.collectAttachedNoteIds(doc)
        for (const requiredNoteId of options.requiredNoteIds) {
          if (!nextNoteIds.has(requiredNoteId)) {
            throw new Error(`Root update did not attach bundled note ${requiredNoteId}`)
          }
        }
      }

      if (sideEffects === 'immediate') {
        this.handleRootDocumentUpdate(this.rootState, update, origin.socketId)
      }

      return () => {
        undoManager.undo()
      }
    } catch (error) {
      undoManager.undo()
      const validationError = error instanceof CanvasTreeValidationError ? error : null
      this.getSocketLogger(origin.socketId).error(
        {
          ...getErrorLogContext(error),
          clientKind: this.socketClientKinds.get(origin.socketId) ?? 'unknown',
          correlationId: this.getSocketCorrelationId(origin.socketId),
          docId: origin.docId,
          offendingSummary: validationError?.offendingSummary,
          payloadSize: update.byteLength,
          socketId: origin.socketId,
          validationPath: validationError?.path,
          validationPathSegments: validationError?.pathSegments,
          validationReason: validationError?.reason,
          workspaceId: this.workspaceId,
        },
        'Rejected invalid root update'
      )

      throw new InvalidRootUpdateError(error instanceof Error ? error.message : String(error))
    }
  }

  private applyCreateNoteBundle(socketId: string, payload: CreateNoteBundlePayload): void {
    const bundledNotes = payload.notes.map((note) => ({
      noteId: note.noteId,
      noteKind: note.noteKind,
      noteSnapshot: normalizeBinary(note.noteSnapshot),
    }))
    const rootUpdate = normalizeBinary(payload.rootUpdate)
    const bundledNoteIds = new Set<string>()
    for (const { noteId } of bundledNotes) {
      if (bundledNoteIds.has(noteId)) {
        throw new Error(`Create-note bundle contains duplicate note ${noteId}`)
      }
      bundledNoteIds.add(noteId)

      const existingRootNote = findWorkspaceNotesMap(this.rootState.doc)?.get(noteId)
      if (existingRootNote || this.noteStates.has(noteId)) {
        throw new Error(`Create-note bundle cannot recreate existing note ${noteId}`)
      }
    }

    for (const { noteId, noteKind, noteSnapshot } of bundledNotes) {
      const validationDoc = new Y.Doc({ guid: noteId })
      try {
        Y.applyUpdateV2(validationDoc, noteSnapshot)
        const validatedNoteKind = validateLoadedNoteDoc(noteId, validationDoc)
        if (validatedNoteKind !== noteKind) {
          throw new Error(`Create-note bundle note ${noteId} has kind ${validatedNoteKind}, expected ${noteKind}`)
        }
      } finally {
        validationDoc.destroy()
      }
    }

    const undoRootUpdate = this.applyValidatedRootUpdate(
      this.rootState.doc,
      rootUpdate,
      { docId: 'root', socketId },
      {
        allowedIntroducedNoteIds: bundledNoteIds,
        requiredNoteIds: bundledNoteIds,
      },
      'deferred'
    )
    this.syncAttachedNotes(socketId)

    try {
      for (const { noteId, noteKind, noteSnapshot } of bundledNotes) {
        const noteState = this.noteStates.get(noteId)
        if (!noteState) {
          throw new Error(`Create-note bundle failed to attach note ${noteId}`)
        }

        this.applyBundledNoteSnapshot(noteState, noteId, noteKind, noteSnapshot)
      }
    } catch (error) {
      undoRootUpdate()
      this.syncAttachedNotes()
      throw error
    }

    this.handleRootDocumentUpdate(this.rootState, rootUpdate, socketId)
    for (const { noteId, noteSnapshot } of bundledNotes) {
      const noteState = this.noteStates.get(noteId)
      if (!noteState) {
        throw new Error(`Create-note bundle lost attached note ${noteId}`)
      }

      this.handleNoteDocumentUpdate(noteState, noteId, noteSnapshot, socketId)
    }
  }

  private handleRootDocumentUpdate(rootState: DocState, update: Uint8Array, originSocketId: string | null): void {
    this.rememberPendingPersistenceOrigin(originSocketId, update.byteLength)
    this.broadcastDocumentUpdate('root', rootState.generation, update, originSocketId)
    this.rootDirty = true

    const log = originSocketId ? this.getSocketLogger(originSocketId) : this.log
    log.debug(
      {
        connectionCount: this.connectionCount,
        stateVersion: 'root',
        updateSize: update.byteLength,
      },
      'Applied workspace root update'
    )

    this.scheduleSave()
  }

  private handleNoteDocumentUpdate(
    noteState: DocState,
    noteId: string,
    update: Uint8Array,
    originSocketId: string | null
  ): void {
    this.rememberPendingPersistenceOrigin(originSocketId, update.byteLength)

    noteState.loaded = true
    noteState.noteKind = validateLoadedNoteDoc(noteId, noteState.doc)
    this.dirtyNoteIds.add(noteId)
    this.deletedNoteIds.delete(noteId)
    this.broadcastDocumentUpdate(noteId, noteState.generation, update, originSocketId)

    const log = originSocketId ? this.getSocketLogger(originSocketId) : this.log
    log.debug(
      {
        connectionCount: this.connectionCount,
        noteId,
        updateSize: update.byteLength,
      },
      'Applied workspace note update'
    )

    this.scheduleSave()
  }

  private applyBundledNoteSnapshot(
    noteState: DocState,
    noteId: string,
    noteKind: DocState['noteKind'],
    noteSnapshot: Uint8Array
  ): void {
    if (!noteKind) {
      throw new Error(`Create-note bundle note ${noteId} is missing a content kind`)
    }

    const validationOrigin = this.createSuppressedDocOrigin()
    noteState.doc.transact(() => {
      ensureNoteDocInitialized(noteState.doc, noteId, noteKind)
      if (noteSnapshot.byteLength > 0) {
        Y.applyUpdateV2(noteState.doc, noteSnapshot, validationOrigin)
      }

      const validatedNoteKind = validateLoadedNoteDoc(noteId, noteState.doc)
      if (validatedNoteKind !== noteKind) {
        throw new Error(`Create-note bundle note ${noteId} has kind ${validatedNoteKind}, expected ${noteKind}`)
      }
    }, validationOrigin)

    noteState.loaded = true
    noteState.noteKind = noteKind
  }

  private createSuppressedDocOrigin(): object {
    const origin = {}
    this.suppressedDocOrigins.add(origin)
    return origin
  }

  private createUndoManager(doc: Y.Doc, trackedOrigin: object): Y.UndoManager {
    doc.getMap('state')
    doc.getMap<Y.Doc>('notes')
    const undoManager = new Y.UndoManager(Array.from(doc.share.values()), {
      trackedOrigins: new Set([trackedOrigin]),
    })
    this.suppressedDocOrigins.add(undoManager)
    return undoManager
  }

  private isSuppressedDocOrigin(origin: unknown): boolean {
    return typeof origin === 'object' && origin !== null && this.suppressedDocOrigins.has(origin)
  }

  private syncAttachedNotes(originSocketId?: string): void {
    const notesMap = findWorkspaceNotesMap(this.rootState.doc)
    const currentNoteIds = new Set<string>()

    if (notesMap) {
      for (const [noteId, noteDoc] of notesMap.entries()) {
        currentNoteIds.add(noteId)

        const existing = this.noteStates.get(noteId)
        if (existing && existing.doc === noteDoc) {
          const becameLoaded = this.refreshAttachedNoteState(existing, noteId, noteDoc)
          if (becameLoaded) {
            this.markAttachedNoteDirty(noteId, existing, originSocketId)
          }
          continue
        }

        if (existing) {
          this.clearTrackedDocAwareness(noteId, existing.awareness)
          this.noteLoadTasks.delete(noteId)
          this.reloadNoteRoomSockets(noteId, 'note_replaced')
          for (const subscriptionState of this.socketSubscriptions.values()) {
            if (subscriptionState.roomType === 'workspace') {
              subscriptionState.awarenessDocIds.delete(noteId)
            }
          }
          existing.teardown()
          this.noteGenerations.set(noteId, existing.generation)
        }

        const noteState = this.createNoteState(noteId, noteDoc)
        this.noteStates.set(noteId, noteState)
        this.markAttachedNoteDirty(noteId, noteState, originSocketId)

        if (originSocketId) {
          const originSubscription = this.socketSubscriptions.get(originSocketId)
          if (originSubscription?.roomType === 'workspace') {
            originSubscription.docIds.add(noteId)
          }
        }

        for (const subscriptionState of this.socketSubscriptions.values()) {
          if (subscriptionState.roomType === 'workspace') {
            subscriptionState.docIds.add(noteId)
          }
        }
      }
    }

    for (const [noteId, noteState] of Array.from(this.noteStates.entries())) {
      if (currentNoteIds.has(noteId)) {
        continue
      }

      this.clearTrackedDocAwareness(noteId, noteState.awareness)
      this.noteLoadTasks.delete(noteId)
      this.reloadNoteRoomSockets(noteId, 'note_removed')

      for (const subscriptionState of this.socketSubscriptions.values()) {
        if (subscriptionState.roomType === 'workspace') {
          subscriptionState.awarenessDocIds.delete(noteId)
          subscriptionState.docIds.delete(noteId)
        }
      }

      noteState.teardown()
      this.noteStates.delete(noteId)
      this.noteGenerations.set(noteId, noteState.generation)
      this.dirtyNoteIds.delete(noteId)
      this.deletedNoteIds.add(noteId)
    }
  }

  private async ensureNoteLoaded(noteId: string, context?: OperationContext): Promise<DocState> {
    const existingTask = this.noteLoadTasks.get(noteId)
    if (existingTask) {
      return existingTask
    }

    const noteState = this.getOrCreateNoteState(noteId)
    if (!noteState) {
      throw new Error(`Unknown note doc ${noteId}`)
    }

    if (noteState.loaded) {
      noteState.noteKind = validateLoadedNoteDoc(noteId, noteState.doc)
      return noteState
    }

    const loadTask = this.loadNoteState(noteId, noteState, context).finally(() => {
      if (this.noteLoadTasks.get(noteId) === loadTask) {
        this.noteLoadTasks.delete(noteId)
      }
    })
    this.noteLoadTasks.set(noteId, loadTask)
    return loadTask
  }

  private inspectAttachedNoteDoc(noteId: string, noteDoc: Y.Doc): { loaded: boolean; noteKind: DocState['noteKind'] } {
    assertAttachedNoteDocReference(noteId, noteDoc)

    if (noteDoc.share.size === 0) {
      return { loaded: false, noteKind: null }
    }

    return {
      loaded: true,
      noteKind: validateLoadedNoteDoc(noteId, noteDoc),
    }
  }

  private refreshAttachedNoteState(noteState: DocState, noteId: string, noteDoc: Y.Doc): boolean {
    const wasLoaded = noteState.loaded
    const { loaded, noteKind } = this.inspectAttachedNoteDoc(noteId, noteDoc)
    noteState.noteKind = noteKind
    noteState.loaded = noteState.loaded || loaded
    return !wasLoaded && noteState.loaded
  }

  private markAttachedNoteDirty(noteId: string, noteState: DocState, originSocketId?: string): void {
    if (!originSocketId || !noteState.loaded) {
      return
    }

    this.dirtyNoteIds.add(noteId)
    this.deletedNoteIds.delete(noteId)
  }

  private async loadAllNoteIds(context?: OperationContext): Promise<string[]> {
    const noteIds = Array.from(findWorkspaceNotesMap(this.rootState.doc)?.keys() ?? []).sort()
    await Promise.all(noteIds.map((noteId) => this.ensureNoteLoaded(noteId, context)))

    return noteIds
  }

  private async loadNoteState(noteId: string, noteState: DocState, context?: OperationContext): Promise<DocState> {
    const noteBytes = await this.store.loadNote(this.workspaceId, noteId, context)
    if (!noteBytes) {
      throw new Error(`Workspace ${this.workspaceId} references missing note blob ${noteId}`)
    }

    const currentState = this.noteStates.get(noteId)
    if (!currentState) {
      throw new Error(`Unknown note doc ${noteId}`)
    }

    if (currentState !== noteState) {
      return this.ensureNoteLoaded(noteId, context)
    }

    Y.applyUpdateV2(noteState.doc, noteBytes, noteState.docOrigin)
    noteState.loaded = true
    noteState.noteKind = validateLoadedNoteDoc(noteId, noteState.doc)
    return noteState
  }

  private getOrCreateNoteState(noteId: string): DocState | null {
    const existing = this.noteStates.get(noteId)
    if (existing) {
      return existing
    }

    const noteDoc = findWorkspaceNotesMap(this.rootState.doc)?.get(noteId)
    if (!noteDoc) {
      return null
    }

    const noteState = this.createNoteState(noteId, noteDoc)
    this.noteStates.set(noteId, noteState)
    return noteState
  }

  private collectAttachedNoteIds(doc: Y.Doc): Set<string> {
    return new Set(findWorkspaceNotesMap(doc)?.keys() ?? [])
  }

  private assertAllowedIntroducedNoteIds(
    currentNoteIds: ReadonlySet<string>,
    nextDoc: Y.Doc,
    allowedIntroducedNoteIds: ReadonlySet<string> | undefined
  ): void {
    for (const noteId of this.collectAttachedNoteIds(nextDoc)) {
      if (currentNoteIds.has(noteId)) {
        continue
      }

      if (allowedIntroducedNoteIds?.has(noteId)) {
        continue
      }

      const noteState = this.noteStates.get(noteId)
      if (!noteState || !noteState.loaded) {
        throw new Error(`Root update introduced unknown note ${noteId}`)
      }

      validateLoadedNoteDoc(noteId, noteState.doc)
    }
  }

  private handleSocketDocEnvelope(
    socket: Socket,
    payload: WorkspaceDocEnvelope,
    stage: 'update' | 'awareness',
    apply: (docState: DocState, update: Uint8Array) => void
  ): void {
    if (this.blockedForReplacement || this.destroyed) {
      return
    }

    const log = this.getSocketLogger(socket.id)
    const rejectedAction = stage === 'update' ? 'document update' : 'awareness update'

    try {
      const { docState, subscriptionState } = this.requireSubscribedDoc(socket.id, payload, stage)
      if (stage === 'update' && subscriptionState.capabilities.accessMode === 'readonly') {
        log.warn(
          {
            docId: payload.docId,
            isSharedLink: subscriptionState.capabilities.isSharedLink,
            payloadSize: payload.update.byteLength,
            socketId: socket.id,
          },
          'Rejected readonly document update without disconnecting socket'
        )
        return
      }

      if (payload.kind === 'note' && payload.generation !== docState.generation) {
        throw new Error(`Rejected ${stage} for note ${payload.docId} with stale generation ${payload.generation}`)
      }

      apply(docState, normalizeBinary(payload.update))
    } catch (error) {
      if (error instanceof InvalidRootUpdateError) {
        return
      }

      log.warn(
        {
          ...getErrorLogContext(error),
          docId: payload.docId,
          payloadSize: payload.update.byteLength,
          socketId: socket.id,
        },
        `Ignored invalid ${rejectedAction}`
      )

      // Stale generations and missing docs can happen transiently during reconnects.
      // Drop the single bad event instead of disconnecting the whole socket.
    }
  }

  private requireSubscribedDoc(
    socketId: string,
    docRef: WorkspaceDocRef,
    stage: 'update' | 'awareness'
  ): { docState: DocState; subscriptionState: SocketSubscriptionState } {
    const subscriptionState = this.socketSubscriptions.get(socketId)
    if (!subscriptionState) {
      throw new Error(`Socket ${socketId} is not attached to workspace room ${this.workspaceId}`)
    }

    const subscribedDocIds = stage === 'awareness' ? subscriptionState.awarenessDocIds : subscriptionState.docIds
    if (!subscribedDocIds.has(docRef.docId)) {
      throw new Error(`Socket ${socketId} is not subscribed to doc ${docRef.docId}`)
    }

    const docState = this.getDocState(docRef)
    if (!docState) {
      throw new Error(`Unknown doc ${docRef.docId}`)
    }

    return { docState, subscriptionState }
  }

  private requireWritableWorkspaceSubscription(socketId: string): SocketSubscriptionState {
    const subscriptionState = this.socketSubscriptions.get(socketId)
    if (!subscriptionState) {
      throw new Error(`Socket ${socketId} is not attached to workspace room ${this.workspaceId}`)
    }

    if (subscriptionState.roomType !== 'workspace') {
      throw new Error(`Socket ${socketId} cannot create notes from room type ${subscriptionState.roomType}`)
    }

    if (!subscriptionState.docIds.has('root')) {
      throw new Error(`Socket ${socketId} is not subscribed to doc root`)
    }

    return subscriptionState
  }

  private getDocState(docRef: WorkspaceDocRef): DocState | null {
    if (docRef.kind === 'root') {
      return this.rootState
    }

    return this.noteStates.get(docRef.docId) ?? null
  }

  private handleAwarenessBroadcast(
    docState: DocState,
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void {
    const changedClients = changes.added.concat(changes.updated, changes.removed)
    if (changedClients.length === 0) {
      return
    }

    const originSocketId = isSocketDocOrigin(origin) ? origin.socketId : null
    const docId = docState.kind === 'root' ? 'root' : (docState.noteId as string)
    if (originSocketId) {
      this.trackSocketClients(originSocketId, docId, changes)
    }

    const payload = {
      docId,
      generation: docState.generation,
      kind: docState.kind,
      update: encodeAwarenessUpdate(docState.awareness, changedClients),
    } satisfies WorkspaceDocEnvelope

    for (const [socketId, socket] of this.sockets) {
      if (socketId === originSocketId) {
        continue
      }

      if (!this.socketSubscriptions.get(socketId)?.awarenessDocIds.has(docId)) {
        continue
      }

      socket.emit(SOCKET_EVENT_AWARENESS, payload)
    }
  }

  private broadcastDocumentUpdate(
    docId: string,
    generation: number,
    update: Uint8Array,
    originSocketId: string | null
  ): void {
    const kind: WorkspaceDocKind = docId === 'root' ? 'root' : 'note'
    const payload = {
      docId,
      generation,
      kind,
      update,
    } satisfies WorkspaceDocEnvelope

    for (const [socketId, socket] of this.sockets) {
      if (socketId === originSocketId) {
        continue
      }

      if (!this.socketSubscriptions.get(socketId)?.docIds.has(docId)) {
        continue
      }

      socket.emit(SOCKET_EVENT_UPDATE, payload)
    }
  }

  private sendFullAwareness(socket: Socket, docState: DocState): void {
    const clientIds = Array.from(docState.awareness.getStates().keys())
    if (clientIds.length === 0) {
      return
    }

    socket.emit(SOCKET_EVENT_AWARENESS, {
      docId: docState.kind === 'root' ? 'root' : (docState.noteId as string),
      generation: docState.generation,
      kind: docState.kind,
      update: encodeAwarenessUpdate(docState.awareness, clientIds),
    } satisfies WorkspaceDocEnvelope)
  }

  private scheduleSave(): void {
    this.clearSaveTimer()

    const context = this.pendingPersistenceContext
    const socketId = this.pendingPersistenceSocketId
    const updateSizeBytes = this.pendingPersistenceUpdateSizeBytes

    this.saveTimer = setTimeout(() => {
      const log = getContextLogger(this.log, context)

      void this.queueSave(context, socketId, updateSizeBytes).catch((error) => {
        log.error(
          {
            ...getErrorLogContext(error),
            connectionCount: this.connectionCount,
            dirtyNoteCount: this.dirtyNoteIds.size,
            rootDirty: this.rootDirty,
            workspaceId: this.workspaceId,
          },
          'Failed to persist debounced workspace update'
        )
        captureException(error, {
          ...getContextSentryExtra(context),
          stage: 'debounced_save',
          workspaceId: this.workspaceId,
        })
      })
    }, this.saveDebounceMs)
  }

  private async flushPendingSave(): Promise<void> {
    await this.queueSave(
      this.pendingPersistenceContext,
      this.pendingPersistenceSocketId,
      this.pendingPersistenceUpdateSizeBytes
    )
  }

  private async queueSave(
    context?: OperationContext,
    socketId?: string | null,
    updateSizeBytes?: number
  ): Promise<void> {
    await this.enqueuePersistenceTask(async () => {
      if (this.destroyed || this.blockedForReplacement) {
        return
      }

      if (!this.rootDirty && this.dirtyNoteIds.size === 0 && this.deletedNoteIds.size === 0) {
        return
      }

      const rootShouldSave = this.rootDirty || this.deletedNoteIds.size > 0
      const noteIdsToSave = Array.from(this.dirtyNoteIds)
        .filter((noteId) => this.noteStates.has(noteId))
        .sort()
      const noteIdsToDelete = Array.from(this.deletedNoteIds).sort()

      this.rootDirty = false
      this.dirtyNoteIds = new Set()
      this.deletedNoteIds = new Set()

      let rootSaved = false
      let deletedNoteCount = 0

      try {
        for (const noteId of noteIdsToSave) {
          const noteState = this.noteStates.get(noteId)
          if (!noteState) {
            continue
          }

          await this.store.saveNote(this.workspaceId, noteId, Y.encodeStateAsUpdateV2(noteState.doc), context)
        }

        if (rootShouldSave) {
          this.assertPersistableRootReferences()
          const rootBytes = Y.encodeStateAsUpdateV2(this.rootState.doc)
          this.logSignificantDocumentShrink(rootBytes.byteLength, updateSizeBytes, socketId)
          this.currentRootSizeBytes = rootBytes.byteLength
          await this.store.saveRoot(this.workspaceId, rootBytes, context)
          rootSaved = true
        }

        for (const noteId of noteIdsToDelete) {
          await this.store.deleteNote(this.workspaceId, noteId, context)
          deletedNoteCount += 1
        }

        if (rootShouldSave || noteIdsToSave.length > 0 || noteIdsToDelete.length > 0) {
          await this.notifyBackendAfterPersistence('save', true, context, {
            deletedNoteCount: noteIdsToDelete.length,
            noteCount: noteIdsToSave.length,
            rootSaved: rootShouldSave,
          })
        }
      } catch (error) {
        if (!rootSaved && rootShouldSave) {
          this.rootDirty = true
        }

        if (!rootSaved) {
          for (const noteId of noteIdsToSave) {
            this.dirtyNoteIds.add(noteId)
          }
        }

        for (const noteId of noteIdsToDelete.slice(deletedNoteCount)) {
          this.deletedNoteIds.add(noteId)
        }
        throw error
      }

      if (this.rootDirty || this.dirtyNoteIds.size > 0 || this.deletedNoteIds.size > 0) {
        this.scheduleSave()
      }
    })
  }

  private async persistSnapshotBundle(
    snapshot: HydratedSnapshotBundle,
    stage: PersistenceStage,
    notifyBackend: boolean,
    context?: OperationContext
  ): Promise<void> {
    const noteSaveResults = await Promise.allSettled(
      snapshot.noteIds.map(async (noteId) => {
        const noteBytes = snapshot.noteBytesById.get(noteId)
        if (!noteBytes) {
          throw new Error(`Snapshot bundle is missing hydrated note bytes for ${noteId}`)
        }

        await this.store.saveNote(this.workspaceId, noteId, noteBytes, context)
      })
    )

    const failedNoteSave = noteSaveResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failedNoteSave) {
      throw failedNoteSave.reason
    }

    await this.store.saveRoot(this.workspaceId, snapshot.rootBytes, context)
    await this.notifyBackendAfterPersistence(stage, notifyBackend, context, {
      noteCount: snapshot.noteIds.length,
      rootSaved: true,
    })
  }

  private async notifyBackendAfterPersistence(
    stage: PersistenceStage,
    notifyBackend: boolean,
    context: OperationContext | undefined,
    extra: Record<string, unknown>
  ): Promise<void> {
    const log = getContextLogger(this.log, context)

    log.info(
      {
        connectionCount: this.connectionCount,
        notifyBackend,
        stage,
        ...extra,
      },
      'Persisted workspace documents'
    )

    if (!notifyBackend) {
      return
    }

    const notified = context?.correlationId
      ? await this.backendNotifier.notifyDocumentUpdated(this.workspaceId, stage, {
          correlationId: context.correlationId,
        })
      : await this.backendNotifier.notifyDocumentUpdated(this.workspaceId, stage)

    if (notified) {
      log.debug({ stage }, 'Backend notification succeeded after document persistence')
    } else {
      log.warn({ stage }, 'Backend notification did not succeed after document persistence')
    }
  }

  private logSignificantDocumentShrink(
    nextDocumentSizeBytes: number,
    incomingUpdateSize: number | undefined,
    socketId: string | null | undefined
  ): void {
    const previousDocumentSizeBytes = this.currentRootSizeBytes
    if (
      !socketId ||
      previousDocumentSizeBytes <= 0 ||
      nextDocumentSizeBytes >= previousDocumentSizeBytes ||
      nextDocumentSizeBytes > previousDocumentSizeBytes * (1 - SIGNIFICANT_DOCUMENT_SHRINK_THRESHOLD)
    ) {
      return
    }

    this.getSocketLogger(socketId).warn(
      {
        incomingUpdateSize,
        nextDocSize: nextDocumentSizeBytes,
        previousDocSize: previousDocumentSizeBytes,
        shrinkBytes: previousDocumentSizeBytes - nextDocumentSizeBytes,
        shrinkRatio: 1 - nextDocumentSizeBytes / previousDocumentSizeBytes,
        stage: 'save',
      },
      'Incoming websocket update reduced root document size significantly'
    )
  }

  private getSocketLogger(socketId: string): Logger {
    return getContextLogger(bindLoggerContext(this.log, { socketId }), this.socketContexts.get(socketId))
  }

  private getSocketCorrelationId(socketId: string): string | undefined {
    return this.socketContexts.get(socketId)?.correlationId
  }

  private async enqueuePersistenceTask(task: () => Promise<void>): Promise<void> {
    const run = this.persistenceQueue.then(task)
    this.persistenceQueue = run.catch(() => undefined)
    return run
  }

  private broadcastReload(reason: string): void {
    for (const socket of this.sockets.values()) {
      socket.emit(SOCKET_EVENT_RELOAD, { reason })
    }
  }

  private disconnectAllSockets(): void {
    for (const socket of this.sockets.values()) {
      socket.disconnect(true)
    }
  }

  private trackSocketClients(
    socketId: string,
    docId: string,
    changes: { added: number[]; updated: number[]; removed: number[] }
  ): void {
    const clientsByDoc = this.socketClientIds.get(socketId) ?? new Map<string, Set<number>>()
    const currentClientIds = clientsByDoc.get(docId) ?? new Set<number>()

    for (const clientId of changes.added.concat(changes.updated)) {
      currentClientIds.add(clientId)
    }

    for (const clientId of changes.removed) {
      currentClientIds.delete(clientId)
    }

    if (currentClientIds.size === 0) {
      clientsByDoc.delete(docId)
    } else {
      clientsByDoc.set(docId, currentClientIds)
    }

    if (clientsByDoc.size === 0) {
      this.socketClientIds.delete(socketId)
      return
    }

    this.socketClientIds.set(socketId, clientsByDoc)
  }

  private clearTrackedDocAwareness(docId: string, awareness: Awareness): void {
    for (const [socketId, clientsByDoc] of Array.from(this.socketClientIds.entries())) {
      const clientIds = clientsByDoc.get(docId)
      if (!clientIds || clientIds.size === 0) {
        continue
      }

      removeAwarenessStates(awareness, Array.from(clientIds), { docId, socketId })

      const nextClientsByDoc = this.socketClientIds.get(socketId)
      if (!nextClientsByDoc) {
        continue
      }

      nextClientsByDoc.delete(docId)
      if (nextClientsByDoc.size === 0) {
        this.socketClientIds.delete(socketId)
      }
    }
  }

  private clearTrackedSocketDocAwareness(socketId: string, docId: string, awareness: Awareness): void {
    const clientsByDoc = this.socketClientIds.get(socketId)
    const clientIds = clientsByDoc?.get(docId)
    if (!clientIds || clientIds.size === 0) {
      return
    }

    clientsByDoc?.delete(docId)
    if (clientsByDoc && clientsByDoc.size === 0) {
      this.socketClientIds.delete(socketId)
    }

    removeAwarenessStates(awareness, Array.from(clientIds), { docId, socketId })
  }

  private reloadNoteRoomSockets(noteId: string, reason: string): void {
    for (const [socketId, subscriptionState] of Array.from(this.socketSubscriptions.entries())) {
      if (subscriptionState.roomType !== 'note' || subscriptionState.noteId !== noteId) {
        continue
      }

      const socket = this.sockets.get(socketId)
      if (!socket) {
        continue
      }

      socket.emit(SOCKET_EVENT_RELOAD, { reason })
      socket.disconnect(true)
    }
  }

  private clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  private assertPersistableRootReferences(): void {
    const notesMap = findWorkspaceNotesMap(this.rootState.doc)
    if (!notesMap) {
      return
    }

    for (const [noteId, noteDoc] of notesMap.entries()) {
      const noteState = this.noteStates.get(noteId)
      if (!noteState || !noteState.loaded) {
        this.log.error(
          { noteId, workspaceId: this.workspaceId },
          'Blocked root save because an attached note is not loaded'
        )
        throw new Error(`Cannot save root while attached note ${noteId} is not loaded`)
      }

      if (noteState.doc !== noteDoc) {
        this.log.error(
          { noteId, workspaceId: this.workspaceId },
          'Blocked root save because tracked note state is detached'
        )
        throw new Error(`Cannot save root while attached note ${noteId} is detached from tracked room state`)
      }

      validateLoadedNoteDoc(noteId, noteState.doc)
    }
  }
}

class InvalidRootUpdateError extends Error {}
