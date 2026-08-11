import * as Y from 'yjs'

export const WORKSPACE_NOTES_MAP_KEY = 'notes'
export const NOTE_META_KEY = 'meta'
export const NOTE_CONTENT_KEY = 'content'
export const NOTE_SCHEMA_VERSION = 1

export type NoteContentKind = 'blockNote' | 'stickyNote'

export interface NoteDocMeta {
  schemaVersion: typeof NOTE_SCHEMA_VERSION
  noteId: string
  contentKind: NoteContentKind
}

export function isNoteContentKind(value: unknown): value is NoteContentKind {
  return value === 'blockNote' || value === 'stickyNote'
}

export function findWorkspaceNotesMap(rootDoc: Y.Doc): Y.Map<Y.Doc> | undefined {
  return rootDoc.share.has(WORKSPACE_NOTES_MAP_KEY) ? rootDoc.getMap<Y.Doc>(WORKSPACE_NOTES_MAP_KEY) : undefined
}

export function ensureWorkspaceNotesMap(rootDoc: Y.Doc): Y.Map<Y.Doc> {
  return rootDoc.getMap<Y.Doc>(WORKSPACE_NOTES_MAP_KEY)
}

export function listWorkspaceNoteIds(rootDoc: Y.Doc): string[] {
  const notesMap = findWorkspaceNotesMap(rootDoc)
  return notesMap ? Array.from(notesMap.keys()).sort() : []
}

export function getNoteDoc(rootDoc: Y.Doc, noteId: string): Y.Doc | undefined {
  return findWorkspaceNotesMap(rootDoc)?.get(noteId)
}

export function hasNoteDoc(rootDoc: Y.Doc, noteId: string): boolean {
  return findWorkspaceNotesMap(rootDoc)?.has(noteId) ?? false
}

export function setNoteDoc(rootDoc: Y.Doc, noteId: string, noteDoc: Y.Doc): void {
  if (noteDoc.guid !== noteId) {
    throw new Error(`Cannot attach note doc ${noteDoc.guid} under note id ${noteId}`)
  }

  ensureWorkspaceNotesMap(rootDoc).set(noteId, noteDoc)
}

export function deleteNoteDoc(rootDoc: Y.Doc, noteId: string): void {
  findWorkspaceNotesMap(rootDoc)?.delete(noteId)
}

export function findNoteMetaMap(noteDoc: Y.Doc): Y.Map<unknown> | undefined {
  return noteDoc.share.has(NOTE_META_KEY) ? noteDoc.getMap(NOTE_META_KEY) : undefined
}

export function ensureNoteMetaMap(noteDoc: Y.Doc): Y.Map<unknown> {
  return noteDoc.getMap(NOTE_META_KEY)
}

export function getNoteDocMeta(noteDoc: Y.Doc): NoteDocMeta | null {
  const meta = findNoteMetaMap(noteDoc)
  if (!meta) {
    return null
  }

  const schemaVersion = meta.get('schemaVersion')
  const noteId = meta.get('noteId')
  const contentKind = meta.get('contentKind')

  if (schemaVersion !== NOTE_SCHEMA_VERSION || typeof noteId !== 'string' || !isNoteContentKind(contentKind)) {
    return null
  }

  return {
    schemaVersion,
    noteId,
    contentKind,
  }
}

export function getNoteContentKind(noteDoc: Y.Doc): NoteContentKind | null {
  return getNoteDocMeta(noteDoc)?.contentKind ?? null
}

export function findNoteBlockNoteFragment(noteDoc: Y.Doc): Y.XmlFragment | undefined {
  if (!noteDoc.share.has(NOTE_CONTENT_KEY)) {
    if (!isNoteContentKind(getNoteContentKind(noteDoc))) {
      return undefined
    }

    return noteDoc.getXmlFragment(NOTE_CONTENT_KEY)
  }

  try {
    return noteDoc.getXmlFragment(NOTE_CONTENT_KEY)
  } catch {
    return undefined
  }
}

export function ensureNoteBlockNoteFragment(noteDoc: Y.Doc): Y.XmlFragment {
  if (!noteDoc.share.has(NOTE_CONTENT_KEY)) {
    return noteDoc.getXmlFragment(NOTE_CONTENT_KEY)
  }

  try {
    return noteDoc.getXmlFragment(NOTE_CONTENT_KEY)
  } catch {
    throw new Error('Note doc content is not a BlockNote fragment')
  }
}

function validateExistingNoteDoc(noteDoc: Y.Doc, noteId: string, contentKind: NoteContentKind): Y.Doc {
  if (noteDoc.guid !== noteId) {
    throw new Error(`Note doc guid ${noteDoc.guid} does not match note id ${noteId}`)
  }

  const meta = getNoteDocMeta(noteDoc)
  if (!meta) {
    throw new Error(`Note doc ${noteId} is missing valid metadata`)
  }

  if (meta.noteId !== noteId) {
    throw new Error(`Note doc meta noteId ${meta.noteId} does not match expected note id ${noteId}`)
  }

  if (meta.contentKind !== contentKind) {
    throw new Error(`Note doc ${noteId} has content kind ${meta.contentKind}, cannot use as ${contentKind}`)
  }

  if (noteDoc.share.has(NOTE_CONTENT_KEY) && !findNoteBlockNoteFragment(noteDoc)) {
    throw new Error(`Note doc ${noteId} is missing BlockNote content`)
  }

  return noteDoc
}

export function ensureNoteDocInitialized(noteDoc: Y.Doc, noteId: string, contentKind: NoteContentKind): Y.Doc {
  if (noteDoc.guid !== noteId) {
    throw new Error(`Note doc guid ${noteDoc.guid} does not match note id ${noteId}`)
  }

  const existingMeta = getNoteDocMeta(noteDoc)
  if (existingMeta) {
    return validateExistingNoteDoc(noteDoc, noteId, contentKind)
  }

  if (noteDoc.share.size > 0) {
    throw new Error(`Note doc ${noteId} is missing valid metadata`)
  }

  const meta = ensureNoteMetaMap(noteDoc)
  meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
  meta.set('noteId', noteId)
  meta.set('contentKind', contentKind)

  ensureNoteBlockNoteFragment(noteDoc)

  return noteDoc
}

export function createNoteDoc(noteId: string, contentKind: NoteContentKind): Y.Doc {
  return ensureNoteDocInitialized(new Y.Doc({ guid: noteId }), noteId, contentKind)
}

export function ensureAttachedNoteDoc(rootDoc: Y.Doc, noteId: string, contentKind: NoteContentKind): Y.Doc {
  const existing = getNoteDoc(rootDoc, noteId)
  if (existing) {
    return validateExistingNoteDoc(existing, noteId, contentKind)
  }

  const noteDoc = createNoteDoc(noteId, contentKind)
  setNoteDoc(rootDoc, noteId, noteDoc)
  return noteDoc
}
