import type { Socket } from 'socket.io-client'
import * as Y from 'yjs'
import { decodeBootstrapPayload, type BootstrapBinaryPayload } from './bootstrap-codec.js'
import { assertValidWorkspaceRoot } from './canvas-tree.js'
import { findWorkspaceNotesMap, getNoteContentKind, type NoteContentKind } from './note-doc.js'
import {
  SocketSyncProviderBase,
  type ProviderReloadEvent,
  type ProviderStatus,
  type ProviderStatusEvent,
  type SyncProviderOptions,
} from './socketio-provider-base.js'
import { isDocReady, normalizeBinary } from './socketio-provider-utils.js'
import type {
  CreateNoteBundlePayload,
  CreateNoteBundleNotePayload,
  WorkspaceBootstrapPayload,
  WorkspaceDocMessagePayload,
  WorkspaceDocRef,
} from './workspace-sync-types.js'

export type WorkspaceProviderStatus = ProviderStatus
export type WorkspaceProviderStatusEvent = ProviderStatusEvent
export type WorkspaceReloadEvent = ProviderReloadEvent

export type WorkspaceProviderOptions = SyncProviderOptions

interface NoteState {
  doc: Y.Doc
  docOrigin: object
  generation: number
  noteId: string
  noteKind: NoteContentKind | null
  pendingDocResync: boolean
  ready: boolean
  teardown: () => void
}

const SOCKET_EVENT_BOOTSTRAP = 'yjs:bootstrap'
const SOCKET_EVENT_UPDATE = 'yjs:update'
const SOCKET_EVENT_CREATE_NOTE_BUNDLE = 'yjs:create-note-bundle'
const SOCKET_EVENT_RELOAD = 'yjs:reload'
const CREATE_NOTE_BUNDLE_TIMEOUT_MS = 2_000

interface PendingCreateNoteBundle {
  bundleId: string
  noteIds: string[]
  rootUpdate: Uint8Array
  timeoutHandle: ReturnType<typeof setTimeout>
}

export class WorkspaceSocketProvider extends SocketSyncProviderBase {
  readonly doc: Y.Doc
  readonly room: string

  rootSynced = false
  allNotesReady = false

  private readonly noteStates = new Map<string, NoteState>()
  private readonly noteGenerations = new Map<string, number>()
  private readonly pendingCreateNoteBundles = new Map<string, PendingCreateNoteBundle>()
  private readonly pendingCreateBundleIdsByNoteId = new Map<string, string>()
  private pendingRootDocResync = false
  private readonly rootDocOrigin = { kind: 'root-doc-origin' }

  constructor(host: string, room: string, doc: Y.Doc, options: WorkspaceProviderOptions = {}) {
    super(host, `${room}:${doc.clientID}`, options)

    this.doc = doc
    this.room = room

    this.doc.on('updateV2', this.handleRootDocumentUpdate)
    this.syncAttachedNotes(false)
    this.updateSyncedState()

    if (this.shouldConnect) {
      this.connect()
    }
  }

  destroy(): void {
    this.disconnect()
    this.destroySocket()

    for (const noteState of this.noteStates.values()) {
      noteState.teardown()
    }
    this.noteStates.clear()
    for (const pendingBundle of this.pendingCreateNoteBundles.values()) {
      clearTimeout(pendingBundle.timeoutHandle)
    }
    this.pendingCreateNoteBundles.clear()
    this.pendingCreateBundleIdsByNoteId.clear()
    this.abortSyncWaiters(this.createDestroyBeforeSyncError())

    this.doc.off('updateV2', this.handleRootDocumentUpdate)
  }

  noteReady(noteId: string): boolean {
    return this.noteStates.get(noteId)?.ready ?? false
  }

  getNoteDoc(noteId: string): Y.Doc | undefined {
    return this.noteStates.get(noteId)?.doc
  }

  /**
   * True when `origin` is this provider's incoming-apply origin for the note's Y.Doc
   * (i.e. the update came from `applyBootstrap`/`applyDocMessage` — the local transport, not a
   * local edit). Lets consumers of the note doc's `update` event distinguish local edits
   * (which should count toward user-edit autosave) from the provider echoing sync traffic.
   */
  isIncomingNoteOrigin(noteId: string, origin: unknown): boolean {
    return this.noteStates.get(noteId)?.docOrigin === origin
  }

  protected onConnected(): void {
    this.rootSynced = false

    for (const noteState of this.noteStates.values()) {
      noteState.ready = false
    }

    this.updateSyncedState()
  }

  protected onDisconnected(): void {
    this.rootSynced = false
    this.updateSyncedState()
  }

  private readonly handleBootstrap = (payload: BootstrapBinaryPayload): void => {
    try {
      this.applyBootstrap(decodeBootstrapPayload(payload))
    } catch (error) {
      this.reportSyncFailure(error instanceof Error ? error : new Error(String(error)))
      this.socket?.disconnect()
    }
  }

  private readonly handleIncomingUpdate = (payload: WorkspaceDocMessagePayload): void => {
    this.applyDocMessage(payload)
  }

  private readonly handleReload = (payload?: { reason?: string }): void => {
    const reason = payload?.reason ?? 'reload'
    this.markReloadRequested()
    this.emitReload(reason)
    if (!this.synced) {
      this.reportSyncFailure(new Error(`Workspace reload requested before initial sync: ${reason}`))
    }
  }

  private readonly handleRootDocumentUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this.rootDocOrigin) {
      return
    }

    if (!this.connected || !this.rootSynced) {
      this.pendingRootDocResync = true
      this.syncAttachedNotes(false)
      return
    }

    const introducedNoteIds = this.collectIntroducedNoteIds()
    if (introducedNoteIds.length > 0) {
      this.queueCreateNoteBundle(update, introducedNoteIds)
      this.syncAttachedNotes(false)
      for (const noteId of introducedNoteIds) {
        this.trySendPendingCreateNoteBundle(noteId)
      }
      return
    }

    this.emitDocUpdate({ docId: 'root', generation: 1, kind: 'root' }, update)
    this.syncAttachedNotes(true)
  }

  private applyBootstrap(payload: WorkspaceBootstrapPayload): void {
    let appliedRoot = false

    for (const docPayload of payload.docs) {
      if (docPayload.kind === 'root') {
        Y.applyUpdateV2(this.doc, normalizeBinary(docPayload.update), this.rootDocOrigin)
        assertValidWorkspaceRoot(this.doc.getMap('state').get('root'))
        this.rootSynced = true
        this.syncAttachedNotes(false)
        appliedRoot = true
        continue
      }

      if (!appliedRoot && !this.rootSynced) {
        throw new Error('Received note bootstrap before root bootstrap')
      }

      const noteState = this.noteStates.get(docPayload.docId)
      if (!noteState) {
        throw new Error(`Received bootstrap for unattached note doc ${docPayload.docId}`)
      }

      noteState.generation = docPayload.generation
      noteState.noteKind = docPayload.noteKind
      this.noteGenerations.set(docPayload.docId, docPayload.generation)
      Y.applyUpdateV2(noteState.doc, normalizeBinary(docPayload.update), noteState.docOrigin)
      this.markNoteReady(noteState)
    }

    this.updateSyncedState()
    this.flushUnsyncedLocalState()
  }

  private applyDocMessage(payload: WorkspaceDocMessagePayload): void {
    const docState = this.getDocState(payload)
    if (!docState) {
      return
    }

    if (payload.kind === 'note' && payload.generation !== docState.generation) {
      return
    }

    Y.applyUpdateV2(docState.doc, normalizeBinary(payload.update), docState.docOrigin)

    if (payload.kind === 'root') {
      assertValidWorkspaceRoot(this.doc.getMap('state').get('root'))
      this.rootSynced = true
      this.syncAttachedNotes(false)
      this.updateSyncedState()
      this.flushUnsyncedLocalState()
      return
    }

    const noteState = this.noteStates.get(payload.docId)
    if (!noteState) {
      return
    }

    noteState.noteKind = getNoteContentKind(noteState.doc)
    this.markNoteReady(noteState)
    this.updateSyncedState()
  }

  private getDocState(payload: WorkspaceDocMessagePayload): {
    doc: Y.Doc
    docOrigin: object
    generation: number
  } | null {
    if (payload.kind === 'root') {
      return {
        doc: this.doc,
        docOrigin: this.rootDocOrigin,
        generation: 1,
      }
    }

    return this.noteStates.get(payload.docId) ?? null
  }

  private syncAttachedNotes(fromLocalRootUpdate: boolean): void {
    const notesMap = findWorkspaceNotesMap(this.doc)
    const currentNoteIds = new Set<string>()

    if (notesMap) {
      for (const [noteId, noteDoc] of notesMap.entries()) {
        currentNoteIds.add(noteId)

        const existing = this.noteStates.get(noteId)
        if (existing && existing.doc === noteDoc) {
          this.refreshAttachedNoteState(existing, noteDoc)
          continue
        }

        this.attachNoteState(noteId, noteDoc, existing, fromLocalRootUpdate)
      }
    }

    for (const [noteId, noteState] of Array.from(this.noteStates.entries())) {
      if (currentNoteIds.has(noteId)) {
        continue
      }

      this.detachNoteState(noteId, noteState)
    }

    this.updateSyncedState()
  }

  private refreshAttachedNoteState(noteState: NoteState, doc: Y.Doc): void {
    noteState.noteKind = getNoteContentKind(doc)
    if (noteState.noteKind) {
      noteState.ready = noteState.ready || isDocReady(doc)
    }
  }

  private attachNoteState(
    noteId: string,
    doc: Y.Doc,
    existing: NoteState | undefined,
    fromLocalRootUpdate: boolean
  ): void {
    if (existing) {
      existing.teardown()
      this.noteGenerations.set(noteId, existing.generation)
    }

    const noteState = this.createNoteState(noteId, doc)
    this.noteStates.set(noteId, noteState)

    if (this.connected && fromLocalRootUpdate && noteState.ready) {
      if (this.hasPendingCreateNoteBundle(noteId)) {
        this.trySendPendingCreateNoteBundle(noteId)
      } else {
        this.sendNoteSnapshot(noteState)
      }
    }
  }

  private detachNoteState(noteId: string, noteState: NoteState): void {
    noteState.teardown()
    this.noteStates.delete(noteId)
    this.noteGenerations.set(noteId, noteState.generation)
  }

  private createNoteState(noteId: string, doc: Y.Doc): NoteState {
    const previousGeneration = this.noteGenerations.get(noteId) ?? 0
    const noteState: NoteState = {
      doc,
      docOrigin: { kind: 'note-doc-origin', noteId },
      generation: previousGeneration > 0 ? previousGeneration + 1 : 1,
      noteId,
      noteKind: getNoteContentKind(doc),
      pendingDocResync: false,
      ready: isDocReady(doc),
      teardown: () => {},
    }

    const handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === noteState.docOrigin) {
        return
      }

      noteState.noteKind = getNoteContentKind(doc)

      if (!this.connected || !this.rootSynced || !noteState.ready) {
        noteState.pendingDocResync = true
        return
      }

      if (this.hasPendingCreateNoteBundle(noteId)) {
        noteState.pendingDocResync = true
        this.trySendPendingCreateNoteBundle(noteId)
        return
      }

      noteState.ready = true
      this.emitDocUpdate({ docId: noteId, generation: noteState.generation, kind: 'note' }, update)
      this.markNoteReady(noteState)
    }

    doc.on('updateV2', handleDocumentUpdate)

    noteState.teardown = () => {
      doc.off('updateV2', handleDocumentUpdate)
    }

    this.noteGenerations.set(noteId, noteState.generation)
    return noteState
  }

  private markNoteReady(noteState: NoteState): void {
    const wasReady = noteState.ready
    noteState.noteKind = getNoteContentKind(noteState.doc)
    noteState.ready = true

    if (!wasReady && noteState.pendingDocResync) {
      if (this.hasPendingCreateNoteBundle(noteState.noteId)) {
        this.trySendPendingCreateNoteBundle(noteState.noteId)
      } else {
        this.sendNoteSnapshot(noteState)
        noteState.pendingDocResync = false
      }
    }
  }

  private sendNoteSnapshot(noteState: NoteState): void {
    if (!this.connected || !this.rootSynced || !noteState.ready) {
      return
    }

    this.emitDocUpdate(
      { docId: noteState.noteId, generation: noteState.generation, kind: 'note' },
      Y.encodeStateAsUpdateV2(noteState.doc)
    )
  }

  private emitDocUpdate(docRef: WorkspaceDocRef & { generation: number }, update: Uint8Array): void {
    this.socket?.emit(SOCKET_EVENT_UPDATE, {
      ...docRef,
      update,
    } satisfies WorkspaceDocMessagePayload)
  }

  private emitCreateNoteBundle(payload: CreateNoteBundlePayload): void {
    this.socket?.emit(SOCKET_EVENT_CREATE_NOTE_BUNDLE, payload)
  }

  private flushUnsyncedLocalState(): void {
    if (!this.connected || !this.rootSynced) {
      return
    }

    if (this.pendingRootDocResync) {
      this.pendingRootDocResync = false
      const rootUpdate = Y.encodeStateAsUpdateV2(this.doc)
      const introducedNoteIds = this.collectIntroducedNoteIds()
      if (introducedNoteIds.length > 0) {
        this.queueCreateNoteBundle(rootUpdate, introducedNoteIds)
        this.syncAttachedNotes(false)
        for (const noteId of introducedNoteIds) {
          this.trySendPendingCreateNoteBundle(noteId)
        }
      } else {
        this.emitDocUpdate({ docId: 'root', generation: 1, kind: 'root' }, rootUpdate)
        this.syncAttachedNotes(true)
      }
    }

    for (const noteState of this.noteStates.values()) {
      if (noteState.pendingDocResync && noteState.ready) {
        if (this.hasPendingCreateNoteBundle(noteState.noteId)) {
          this.trySendPendingCreateNoteBundle(noteState.noteId)
        } else {
          this.sendNoteSnapshot(noteState)
          noteState.pendingDocResync = false
        }
      }
    }
  }

  private listTrackedNoteIds(): string[] {
    return Array.from(this.noteStates.keys()).sort()
  }

  protected buildSocketAuth(): Record<string, unknown> {
    return {
      ...this.buildBaseSocketAuth(),
      workspaceId: this.room,
    }
  }

  protected registerSocketHandlers(socket: Socket): void {
    socket.on(SOCKET_EVENT_BOOTSTRAP, this.handleBootstrap)
    socket.on(SOCKET_EVENT_UPDATE, this.handleIncomingUpdate)
    socket.on(SOCKET_EVENT_RELOAD, this.handleReload)
  }

  protected unregisterSocketHandlers(socket: Socket): void {
    socket.off(SOCKET_EVENT_BOOTSTRAP, this.handleBootstrap)
    socket.off(SOCKET_EVENT_UPDATE, this.handleIncomingUpdate)
    socket.off(SOCKET_EVENT_RELOAD, this.handleReload)
  }

  protected createDisconnectBeforeSyncError(): Error {
    return new Error('Workspace provider disconnected before workspace note docs became ready')
  }

  protected createDestroyBeforeSyncError(): Error {
    return new Error('Workspace provider was destroyed before workspace note docs became ready')
  }

  private updateSyncedState(): void {
    const noteIds = this.listTrackedNoteIds()
    const nextAllNotesReady = noteIds.every((noteId) => this.noteStates.get(noteId)?.ready === true)

    if (this.allNotesReady !== nextAllNotesReady) {
      this.allNotesReady = nextAllNotesReady
    }

    this.setSynced(this.rootSynced && this.allNotesReady)
  }

  private collectIntroducedNoteIds(): string[] {
    const notesMap = findWorkspaceNotesMap(this.doc)
    if (!notesMap) {
      return []
    }

    const introducedNoteIds: string[] = []
    for (const noteId of notesMap.keys()) {
      if (!this.noteStates.has(noteId)) {
        introducedNoteIds.push(noteId)
      }
    }

    introducedNoteIds.sort()
    return introducedNoteIds
  }

  private hasPendingCreateNoteBundle(noteId: string): boolean {
    return this.pendingCreateBundleIdsByNoteId.has(noteId)
  }

  private createPendingCreateNoteBundleId(noteIds: string[]): string {
    return noteIds.join('\u0000')
  }

  private queueCreateNoteBundle(rootUpdate: Uint8Array, introducedNoteIds: string[]): void {
    if (introducedNoteIds.length === 0) {
      return
    }

    const noteIds = [...introducedNoteIds].sort()
    const bundleId = this.createPendingCreateNoteBundleId(noteIds)
    const existing = this.pendingCreateNoteBundles.get(bundleId)
    if (existing) {
      existing.rootUpdate = Y.mergeUpdatesV2([existing.rootUpdate, rootUpdate])
      return
    }

    for (const noteId of noteIds) {
      const existingBundleId = this.pendingCreateBundleIdsByNoteId.get(noteId)
      if (existingBundleId && existingBundleId !== bundleId) {
        this.requestReload(
          'create_note_bundle_overlap',
          `Workspace provider cannot merge overlapping create-note bundles for note ${noteId}`
        )
        return
      }
    }

    const timeoutHandle = setTimeout(() => {
      this.pendingCreateNoteBundles.delete(bundleId)
      for (const noteId of noteIds) {
        this.pendingCreateBundleIdsByNoteId.delete(noteId)
      }
      this.requestReload(
        'create_note_bundle_timeout',
        `Workspace provider timed out waiting for notes ${noteIds.join(', ')} to become ready for create bundle sync`
      )
    }, CREATE_NOTE_BUNDLE_TIMEOUT_MS)

    for (const noteId of noteIds) {
      this.pendingCreateBundleIdsByNoteId.set(noteId, bundleId)
    }

    this.pendingCreateNoteBundles.set(bundleId, {
      bundleId,
      noteIds,
      rootUpdate,
      timeoutHandle,
    })
  }

  private trySendPendingCreateNoteBundle(noteId: string): void {
    const bundleId = this.pendingCreateBundleIdsByNoteId.get(noteId)
    if (!bundleId) {
      return
    }

    const pendingBundle = this.pendingCreateNoteBundles.get(bundleId)
    if (!pendingBundle || !this.connected || !this.rootSynced) {
      return
    }

    const notes: CreateNoteBundleNotePayload[] = []
    for (const bundledNoteId of pendingBundle.noteIds) {
      const noteState = this.noteStates.get(bundledNoteId)
      if (!noteState || !noteState.ready || !noteState.noteKind) {
        return
      }

      notes.push({
        noteId: bundledNoteId,
        noteKind: noteState.noteKind,
        noteSnapshot: Y.encodeStateAsUpdateV2(noteState.doc),
      })
    }

    clearTimeout(pendingBundle.timeoutHandle)
    this.pendingCreateNoteBundles.delete(bundleId)
    for (const bundledNoteId of pendingBundle.noteIds) {
      this.pendingCreateBundleIdsByNoteId.delete(bundledNoteId)
      const noteState = this.noteStates.get(bundledNoteId)
      if (noteState) {
        noteState.pendingDocResync = false
      }
    }

    this.emitCreateNoteBundle({
      notes,
      rootUpdate: pendingBundle.rootUpdate,
    })
  }
}

export type WorkspaceSocketProviderInstance = WorkspaceSocketProvider
