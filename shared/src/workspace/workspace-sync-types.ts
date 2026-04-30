import type { NoteContentKind } from './note-doc.js'

export type WorkspaceDocKind = 'root' | 'note'

export interface WorkspaceDocRef {
  docId: string
  kind: WorkspaceDocKind
}

export interface WorkspaceDocEnvelope extends WorkspaceDocRef {
  generation: number
  update: Uint8Array
}

export interface WorkspaceRootBootstrapDoc extends WorkspaceDocEnvelope {
  kind: 'root'
}

export interface WorkspaceNoteBootstrapDoc extends WorkspaceDocEnvelope {
  kind: 'note'
  noteKind: NoteContentKind
}

export type WorkspaceBootstrapDoc = WorkspaceRootBootstrapDoc | WorkspaceNoteBootstrapDoc

export interface WorkspaceBootstrapPayload {
  docs: WorkspaceBootstrapDoc[]
}

export interface WorkspaceDocMessagePayload extends WorkspaceDocEnvelope {}

export interface WorkspaceDocAwarenessPayload extends WorkspaceDocEnvelope {}

export interface CreateNoteBundleNotePayload {
  noteId: string
  noteKind: NoteContentKind
  noteSnapshot: Uint8Array
}

export interface CreateNoteBundlePayload {
  notes: CreateNoteBundleNotePayload[]
  rootUpdate: Uint8Array
}

export type WorkspaceAwarenessSubscriptionAction = 'subscribe' | 'unsubscribe'

export interface WorkspaceAwarenessSubscriptionPayload extends WorkspaceDocRef {
  action: WorkspaceAwarenessSubscriptionAction
}

export interface WorkspaceSnapshotBundle {
  root: string
  notes: Record<string, string>
}
