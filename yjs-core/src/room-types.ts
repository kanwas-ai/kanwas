import * as Y from 'yjs'
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
  WorkspaceBootstrapDoc,
  WorkspaceBootstrapPayload,
  WorkspaceDocEnvelope,
  WorkspaceDocKind,
  WorkspaceDocRef,
  WorkspaceSnapshotBundle,
} from 'shared/workspace-sync-types'
import type { DocumentStore } from './document-store.js'
import type { Logger } from './logger.js'

export type BinaryPayload = ArrayBuffer | Uint8Array | Buffer | number[]
export { NOTE_CONTENT_KEY, findWorkspaceNotesMap, getNoteContentKind }
export type {
  NoteContentKind,
  NoteDocMeta,
  CreateNoteBundlePayload,
  CreateNoteBundleNotePayload,
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
  accessMode: 'editable' | 'readonly'
}

export type ClientKind = 'renderer' | 'local-runtime' | 'unknown'

export const DEFAULT_SOCKET_CAPABILITIES: SocketCapabilities = {
  accessMode: 'editable',
}

export interface SocketSubscriptionState {
  capabilities: SocketCapabilities
  docIds: Set<string>
}

export interface ReplaceDocumentOptions {
  reason: string
}

export interface WorkspaceRoomOptions {
  workspaceId: string
  store: DocumentStore
  saveDebounceMs: number
  saveMaxWaitMs: number
  logger: Logger
}

export interface AttachWorkspaceSocketOptions {
  capabilities?: SocketCapabilities
  clientKind?: ClientKind
  skipBootstrapValidation?: boolean
}

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
