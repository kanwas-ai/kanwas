export {
  WORKSPACE_NOTES_MAP_KEY,
  NOTE_META_KEY,
  NOTE_CONTENT_KEY,
  NOTE_SCHEMA_VERSION,
  isNoteContentKind,
  findWorkspaceNotesMap,
  ensureWorkspaceNotesMap,
  getNoteDoc,
  deleteNoteDoc,
  getNoteContentKind,
  findNoteBlockNoteFragment,
  ensureAttachedNoteDoc,
} from 'shared/note-doc'
import { ensureAttachedNoteDoc, type NoteContentKind } from 'shared/note-doc'
import type * as Y from 'yjs'

export type { NoteContentKind }

export function createNoteDoc(rootDoc: Y.Doc, noteId: string, contentKind: NoteContentKind): Y.Doc {
  return ensureAttachedNoteDoc(rootDoc, noteId, contentKind)
}

export function isNoteNodeType(value: unknown): value is import('shared/note-doc').NoteContentKind {
  return value === 'blockNote' || value === 'stickyNote'
}
