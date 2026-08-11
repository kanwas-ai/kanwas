import * as Y from 'yjs'
import { findWorkspaceNotesMap } from './note-doc.js'
import type { WorkspaceSnapshotBundle } from './workspace-sync-types.js'

export function encodeSnapshotDocument(document: Uint8Array | Buffer): string {
  return Buffer.from(document).toString('base64')
}

export function decodeSnapshotDocument(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

export function createWorkspaceSnapshotBundle(rootDoc: Y.Doc): WorkspaceSnapshotBundle {
  const root = encodeSnapshotDocument(Y.encodeStateAsUpdateV2(rootDoc))
  const notesMap = findWorkspaceNotesMap(rootDoc)
  const notes: Record<string, string> = {}

  for (const noteId of Array.from(notesMap?.keys() ?? []).sort()) {
    const noteDoc = notesMap?.get(noteId)
    if (!noteDoc) {
      continue
    }

    notes[noteId] = encodeSnapshotDocument(Y.encodeStateAsUpdateV2(noteDoc))
  }

  return { root, notes }
}

export function applyWorkspaceSnapshotBundle(rootDoc: Y.Doc, snapshot: WorkspaceSnapshotBundle): void {
  const rootBytes = decodeSnapshotDocument(snapshot.root)
  if (rootBytes.byteLength > 0) {
    Y.applyUpdateV2(rootDoc, rootBytes)
  }

  const notesMap = findWorkspaceNotesMap(rootDoc)
  for (const noteId of Array.from(notesMap?.keys() ?? []).sort()) {
    const noteDoc = notesMap?.get(noteId)
    if (!noteDoc) {
      continue
    }

    const encodedNote = snapshot.notes[noteId]
    if (!encodedNote) {
      throw new Error(`Snapshot bundle is missing note blob for ${noteId}`)
    }

    const noteBytes = decodeSnapshotDocument(encodedNote)
    if (noteBytes.byteLength > 0) {
      Y.applyUpdateV2(noteDoc, noteBytes)
    }
  }
}

export function hydrateWorkspaceSnapshotBundle(snapshot: WorkspaceSnapshotBundle): Y.Doc {
  const rootDoc = new Y.Doc()
  applyWorkspaceSnapshotBundle(rootDoc, snapshot)
  return rootDoc
}
