import { Awareness } from 'y-protocols/awareness.js'
import * as Y from 'yjs'
import type { DocumentShareAccessMode } from 'shared/document-share'
import {
  NOTE_CONTENT_KEY,
  findWorkspaceNotesMap,
  getNoteContentKind,
  getNoteDocMeta,
  type NoteContentKind,
  type NoteDocMeta,
} from 'shared/note-doc'
import type {
  CreateNoteBundlePayload,
  CreateNoteBundleNotePayload,
  WorkspaceAwarenessSubscriptionAction,
  WorkspaceAwarenessSubscriptionPayload,
  WorkspaceBootstrapDoc,
  WorkspaceBootstrapPayload,
  WorkspaceDocEnvelope,
  WorkspaceDocKind,
  WorkspaceDocRef,
  WorkspaceSnapshotBundle,
} from 'shared/workspace-sync-types'
import type { BackendNotifier } from './backend-notifier.js'
import type { Logger } from './logger.js'
import type { PersistenceStage } from './protocol.js'
import type { DocumentStore } from './storage.js'

export type BinaryPayload = ArrayBuffer | Uint8Array | Buffer | number[]
export type WorkspaceRoomType = 'workspace' | 'note'
export { NOTE_CONTENT_KEY, findWorkspaceNotesMap, getNoteContentKind }
export type {
  NoteContentKind,
  NoteDocMeta,
  CreateNoteBundlePayload,
  CreateNoteBundleNotePayload,
  WorkspaceAwarenessSubscriptionAction,
  WorkspaceAwarenessSubscriptionPayload,
  WorkspaceBootstrapDoc,
  WorkspaceBootstrapPayload,
  WorkspaceDocEnvelope,
  WorkspaceDocKind,
  WorkspaceDocRef,
  WorkspaceSnapshotBundle,
}

export interface SocketDocOrigin {
  docId: string
  socketId: string
}

export interface DocState {
  awareness: Awareness
  awarenessOrigin: object
  doc: Y.Doc
  docOrigin: object
  generation: number
  kind: WorkspaceDocKind
  loaded: boolean
  noteId?: string
  noteKind?: NoteContentKind | null
  teardown: () => void
}

export interface SocketCapabilities {
  accessMode: DocumentShareAccessMode
  isSharedLink: boolean
}

export type ClientKind = 'frontend' | 'execenv' | 'cli' | 'unknown'

export const DEFAULT_SOCKET_CAPABILITIES: SocketCapabilities = {
  accessMode: 'editable',
  isSharedLink: false,
}

interface BaseSocketSubscriptionState {
  awarenessDocIds: Set<string>
  capabilities: SocketCapabilities
  docIds: Set<string>
}

export interface WorkspaceSocketSubscriptionState extends BaseSocketSubscriptionState {
  roomType: 'workspace'
}

export interface NoteSocketSubscriptionState extends BaseSocketSubscriptionState {
  noteId: string
  roomType: 'note'
}

export type SocketSubscriptionState = WorkspaceSocketSubscriptionState | NoteSocketSubscriptionState

export interface ReplaceDocumentOptions {
  stage: Extract<PersistenceStage, 'replace'>
  reason: string
  notifyBackend: boolean
}

export interface WorkspaceRoomOptions {
  workspaceId: string
  store: DocumentStore
  backendNotifier: BackendNotifier
  saveDebounceMs: number
  logger: Logger
}

export interface AttachWorkspaceSocketOptions {
  capabilities?: SocketCapabilities
  clientKind?: ClientKind
  roomType: 'workspace'
  skipBootstrapValidation?: boolean
}

export interface AttachNoteSocketOptions {
  capabilities?: SocketCapabilities
  clientKind?: ClientKind
  noteId: string
  roomType: 'note'
  skipBootstrapValidation?: boolean
}

export type AttachSocketOptions = AttachWorkspaceSocketOptions | AttachNoteSocketOptions

export interface InitializeRoomOptions {
  skipBootstrapValidation?: boolean
}

export const SIGNIFICANT_DOCUMENT_SHRINK_THRESHOLD = 0.3

export function isSocketDocOrigin(value: unknown): value is SocketDocOrigin {
  return typeof value === 'object' && value !== null && 'docId' in value && 'socketId' in value
}

export function assertAttachedNoteDocReference(noteId: string, noteDoc: Y.Doc): void {
  if (noteDoc.guid !== noteId) {
    throw new Error(`Attached note doc guid ${noteDoc.guid} does not match note id ${noteId}`)
  }
}

export function validateLoadedNoteDoc(noteId: string, noteDoc: Y.Doc): NoteContentKind {
  assertAttachedNoteDocReference(noteId, noteDoc)

  const meta = getNoteDocMeta(noteDoc)
  if (!meta) {
    throw new Error(`Loaded note doc ${noteId} is missing valid metadata`)
  }

  if (meta.noteId !== noteId) {
    throw new Error(`Loaded note doc ${noteId} has mismatched noteId metadata ${meta.noteId}`)
  }

  if (noteDoc.share.has(NOTE_CONTENT_KEY)) {
    try {
      noteDoc.getXmlFragment(NOTE_CONTENT_KEY)
    } catch {
      throw new Error(`Loaded note doc ${noteId} has invalid BlockNote content`)
    }
  }

  return meta.contentKind
}

export function normalizeBinary(payload: BinaryPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  return Uint8Array.from(payload)
}

export function getDocumentSize(doc: Y.Doc): number {
  return Y.encodeStateAsUpdateV2(doc).byteLength
}

export function decodeBase64Document(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

export function encodeBootstrapDoc(state: DocState): WorkspaceBootstrapDoc {
  if (state.kind === 'root') {
    return {
      docId: 'root',
      generation: state.generation,
      kind: 'root',
      update: Y.encodeStateAsUpdateV2(state.doc),
    }
  }

  if (!state.noteKind) {
    throw new Error(`Cannot bootstrap note ${state.noteId} without a content kind`)
  }

  return {
    docId: state.noteId as string,
    generation: state.generation,
    kind: 'note',
    noteKind: state.noteKind,
    update: Y.encodeStateAsUpdateV2(state.doc),
  }
}
