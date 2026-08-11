import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness.js'
import type { Socket } from 'socket.io-client'
import * as Y from 'yjs'
import { decodeBootstrapPayload, type BootstrapBinaryPayload } from './bootstrap-codec.js'
import { getNoteContentKind, type NoteContentKind } from './note-doc.js'
import {
  SocketSyncProviderBase,
  type ProviderReloadEvent,
  type ProviderStatus,
  type ProviderStatusEvent,
  type SyncProviderOptions,
} from './socketio-provider-base.js'
import { collectChangedClients, normalizeBinary, type AwarenessChanges } from './socketio-provider-utils.js'
import type {
  WorkspaceBootstrapPayload,
  WorkspaceDocAwarenessPayload,
  WorkspaceDocMessagePayload,
} from './workspace-sync-types.js'

export type NoteProviderStatus = ProviderStatus
export type NoteProviderStatusEvent = ProviderStatusEvent
export type NoteReloadEvent = ProviderReloadEvent

export interface NoteProviderOptions extends SyncProviderOptions {
  awareness?: Awareness
}

const SOCKET_EVENT_BOOTSTRAP = 'yjs:bootstrap'
const SOCKET_EVENT_UPDATE = 'yjs:update'
const SOCKET_EVENT_AWARENESS = 'yjs:awareness'
const SOCKET_EVENT_RELOAD = 'yjs:reload'

export class NoteSocketProvider extends SocketSyncProviderBase {
  readonly awareness: Awareness
  readonly doc: Y.Doc
  readonly workspaceId: string
  readonly noteId: string

  noteKind: NoteContentKind | null

  private generation = 0
  private pendingAwarenessResync = false
  private pendingDocResync = false
  private readonly docOrigin: object
  private readonly awarenessOrigin: object
  private readonly ownsAwareness: boolean

  constructor(host: string, workspaceId: string, noteId: string, doc: Y.Doc, options: NoteProviderOptions = {}) {
    super(host, `${workspaceId}:${noteId}:${doc.clientID}`, options)

    this.doc = doc
    this.workspaceId = workspaceId
    this.noteId = noteId
    this.awareness = options.awareness ?? new Awareness(doc)
    this.ownsAwareness = !options.awareness
    this.noteKind = getNoteContentKind(doc)
    this.docOrigin = { kind: 'note-room-doc-origin', noteId }
    this.awarenessOrigin = { kind: 'note-room-awareness-origin', noteId }

    this.doc.on('updateV2', this.handleDocumentUpdate)
    this.awareness.on('update', this.handleAwarenessUpdate)

    if (this.shouldConnect) {
      this.connect()
    }
  }

  destroy(): void {
    this.disconnect()
    this.destroySocket()

    this.doc.off('updateV2', this.handleDocumentUpdate)
    this.awareness.off('update', this.handleAwarenessUpdate)

    if (this.ownsAwareness) {
      this.awareness.destroy()
    }
    this.abortSyncWaiters(this.createDestroyBeforeSyncError())
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
    if (payload.kind !== 'note' || payload.docId !== this.noteId) {
      return
    }

    if (payload.generation !== this.generation) {
      this.requestReload('note_generation_changed', `Note generation changed while syncing ${this.noteId}`)
      return
    }

    Y.applyUpdateV2(this.doc, normalizeBinary(payload.update), this.docOrigin)
    this.markNoteSynced(payload.generation)
  }

  private readonly handleIncomingAwareness = (payload: WorkspaceDocAwarenessPayload): void => {
    if (payload.kind !== 'note' || payload.docId !== this.noteId) {
      return
    }

    if (payload.generation !== this.generation) {
      this.requestReload('note_generation_changed', `Note generation changed while syncing ${this.noteId}`)
      return
    }

    applyAwarenessUpdate(this.awareness, normalizeBinary(payload.update), this.awarenessOrigin)
  }

  private readonly handleReload = (payload?: { reason?: string }): void => {
    const reason = payload?.reason ?? 'reload'
    this.markReloadRequested()
    this.emitReload(reason)
    if (!this.synced) {
      this.reportSyncFailure(new Error(`Note reload requested before initial sync: ${reason}`))
    }
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this.docOrigin) {
      return
    }

    this.noteKind = getNoteContentKind(this.doc)

    if (!this.connected || !this.synced) {
      this.pendingDocResync = true
      return
    }

    this.socket?.emit(SOCKET_EVENT_UPDATE, {
      docId: this.noteId,
      generation: this.generation,
      kind: 'note',
      update,
    } satisfies WorkspaceDocMessagePayload)
  }

  private readonly handleAwarenessUpdate = (changes: AwarenessChanges, origin: unknown): void => {
    if (origin === this.awarenessOrigin) {
      return
    }

    if (!this.connected || !this.synced) {
      this.pendingAwarenessResync = true
      return
    }

    const changedClients = collectChangedClients(changes)
    if (changedClients.length === 0) {
      return
    }

    this.socket?.emit(SOCKET_EVENT_AWARENESS, {
      docId: this.noteId,
      generation: this.generation,
      kind: 'note',
      update: encodeAwarenessUpdate(this.awareness, changedClients),
    } satisfies WorkspaceDocAwarenessPayload)
  }

  private applyBootstrap(payload: WorkspaceBootstrapPayload): void {
    if (payload.docs.length !== 1) {
      throw new Error(`Expected one note bootstrap doc for ${this.noteId}, received ${payload.docs.length}`)
    }

    const [docPayload] = payload.docs
    if (docPayload.kind !== 'note' || docPayload.docId !== this.noteId) {
      throw new Error(`Received unexpected bootstrap payload while connecting to note ${this.noteId}`)
    }

    if (this.generation > 0 && this.generation !== docPayload.generation && this.doc.share.size > 0) {
      this.requestReload('note_generation_changed', `Note generation changed while syncing ${this.noteId}`)
      return
    }

    Y.applyUpdateV2(this.doc, normalizeBinary(docPayload.update), this.docOrigin)
    this.noteKind = docPayload.noteKind
    this.markNoteSynced(docPayload.generation)
  }

  private markNoteSynced(generation: number): void {
    this.generation = generation
    this.noteKind = getNoteContentKind(this.doc) ?? this.noteKind
    if (!this.synced) {
      super.markSynced()
    }

    this.flushUnsyncedLocalState()
  }

  private flushUnsyncedLocalState(): void {
    if (!this.connected || !this.synced) {
      return
    }

    if (this.pendingDocResync) {
      this.pendingDocResync = false
      this.socket?.emit(SOCKET_EVENT_UPDATE, {
        docId: this.noteId,
        generation: this.generation,
        kind: 'note',
        update: Y.encodeStateAsUpdateV2(this.doc),
      } satisfies WorkspaceDocMessagePayload)
    }

    if (this.pendingAwarenessResync) {
      this.pendingAwarenessResync = false
    }

    this.sendLocalAwareness()
  }

  private sendLocalAwareness(): void {
    if (!this.connected || !this.synced || this.awareness.getLocalState() === null) {
      return
    }

    this.socket?.emit(SOCKET_EVENT_AWARENESS, {
      docId: this.noteId,
      generation: this.generation,
      kind: 'note',
      update: encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
    } satisfies WorkspaceDocAwarenessPayload)
  }

  protected clearRemoteAwareness(): void {
    const remoteClientIds = Array.from(this.awareness.getStates().keys()).filter(
      (clientId) => clientId !== this.doc.clientID
    )
    if (remoteClientIds.length === 0) {
      return
    }

    removeAwarenessStates(this.awareness, remoteClientIds, this.awarenessOrigin)
  }

  protected buildSocketAuth(): Record<string, unknown> {
    return {
      ...this.buildBaseSocketAuth(),
      roomType: 'note',
      workspaceId: this.workspaceId,
      noteId: this.noteId,
    }
  }

  protected registerSocketHandlers(socket: Socket): void {
    socket.on(SOCKET_EVENT_BOOTSTRAP, this.handleBootstrap)
    socket.on(SOCKET_EVENT_UPDATE, this.handleIncomingUpdate)
    socket.on(SOCKET_EVENT_AWARENESS, this.handleIncomingAwareness)
    socket.on(SOCKET_EVENT_RELOAD, this.handleReload)
  }

  protected unregisterSocketHandlers(socket: Socket): void {
    socket.off(SOCKET_EVENT_BOOTSTRAP, this.handleBootstrap)
    socket.off(SOCKET_EVENT_UPDATE, this.handleIncomingUpdate)
    socket.off(SOCKET_EVENT_AWARENESS, this.handleIncomingAwareness)
    socket.off(SOCKET_EVENT_RELOAD, this.handleReload)
  }

  protected onConnected(): void {}

  protected onDisconnected(): void {}

  protected createDisconnectBeforeSyncError(): Error {
    return new Error(`Note provider disconnected before note doc ${this.noteId} became ready`)
  }

  protected createDestroyBeforeSyncError(): Error {
    return new Error(`Note provider was destroyed before note doc ${this.noteId} became ready`)
  }
}

export type NoteSocketProviderInstance = NoteSocketProvider
