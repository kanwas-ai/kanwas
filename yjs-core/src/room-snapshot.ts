import * as Y from 'yjs'
import { assertValidWorkspaceRoot } from 'shared/canvas-tree'
import {
  assertAttachedNoteDocReference,
  decodeBase64Document,
  findWorkspaceNotesMap,
  validateLoadedNoteDoc,
  type WorkspaceSnapshotBundle,
} from './room-types.js'

export interface HydratedSnapshotBundle {
  noteBytesById: Map<string, Uint8Array>
  noteIds: string[]
  rootBytes: Uint8Array
  rootDoc: Y.Doc
}

export function hydrateSnapshotBundle(snapshot: WorkspaceSnapshotBundle): HydratedSnapshotBundle {
  const rootDoc = new Y.Doc()
  const rootBytes = decodeBase64Document(snapshot.root)
  if (rootBytes.byteLength > 0) {
    Y.applyUpdateV2(rootDoc, rootBytes)
  }

  assertValidWorkspaceRoot(rootDoc.getMap('state').get('root'))

  const noteBytesById = new Map<string, Uint8Array>()
  const notesMap = findWorkspaceNotesMap(rootDoc)
  const noteIds = Array.from(notesMap?.keys() ?? []).sort()
  const noteIdSet = new Set(noteIds)
  const extraSnapshotNoteIds = Object.keys(snapshot.notes)
    .filter((noteId) => !noteIdSet.has(noteId))
    .sort()

  if (extraSnapshotNoteIds.length > 0) {
    throw new Error(`Snapshot bundle contains extra note blobs: ${extraSnapshotNoteIds.join(', ')}`)
  }

  if (notesMap) {
    for (const [noteId, noteDoc] of notesMap.entries()) {
      assertAttachedNoteDocReference(noteId, noteDoc)

      const encodedNote = snapshot.notes[noteId]
      if (!encodedNote) {
        throw new Error(`Snapshot bundle is missing note blob for ${noteId}`)
      }

      const noteBytes = decodeBase64Document(encodedNote)
      noteBytesById.set(noteId, noteBytes)

      if (noteBytes.byteLength > 0) {
        Y.applyUpdateV2(noteDoc, noteBytes)
      }

      validateLoadedNoteDoc(noteId, noteDoc)
    }
  }

  return {
    noteBytesById,
    noteIds,
    rootBytes,
    rootDoc,
  }
}
