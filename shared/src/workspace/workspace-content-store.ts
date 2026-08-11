import * as Y from 'yjs'
import { copyBlockNoteFragment } from './blocknote-fragment-copy.js'
import {
  type NoteContentKind,
  deleteNoteDoc as deleteAttachedNoteDoc,
  ensureAttachedNoteDoc,
  ensureNoteBlockNoteFragment,
  findNoteBlockNoteFragment,
  findWorkspaceNotesMap,
  getNoteContentKind,
  getNoteDoc,
} from './note-doc.js'

export interface WorkspaceContentStore {
  listNoteIds(): string[]
  getNoteKind(noteId: string): NoteContentKind | null
  getNoteFragment(noteId: string): Y.XmlFragment | undefined
  getBlockNoteFragment(noteId: string): Y.XmlFragment | undefined
  setBlockNoteFragment(noteId: string, fragment: Y.XmlFragment): void
  createNoteDoc(noteId: string, kind: NoteContentKind): void
  deleteNoteDoc(noteId: string): void
}

export class YjsWorkspaceContentStore implements WorkspaceContentStore {
  constructor(private readonly rootDoc: Y.Doc) {}

  listNoteIds(): string[] {
    const notesMap = findWorkspaceNotesMap(this.rootDoc)
    return notesMap ? Array.from(notesMap.keys()).sort() : []
  }

  getNoteKind(noteId: string): NoteContentKind | null {
    const noteDoc = getNoteDoc(this.rootDoc, noteId)
    if (noteDoc) {
      return getNoteContentKind(noteDoc)
    }

    return null
  }

  getBlockNoteFragment(noteId: string): Y.XmlFragment | undefined {
    return this.getNoteFragment(noteId)
  }

  getNoteFragment(noteId: string): Y.XmlFragment | undefined {
    const noteDoc = getNoteDoc(this.rootDoc, noteId)
    if (noteDoc && getNoteContentKind(noteDoc)) {
      return ensureNoteBlockNoteFragment(noteDoc)
    }

    return undefined
  }

  setBlockNoteFragment(noteId: string, fragment: Y.XmlFragment): void {
    const existingNoteDoc = getNoteDoc(this.rootDoc, noteId)
    const noteKind = existingNoteDoc ? (getNoteContentKind(existingNoteDoc) ?? 'blockNote') : 'blockNote'
    const noteDoc = ensureAttachedNoteDoc(this.rootDoc, noteId, noteKind)
    const targetFragment = findNoteBlockNoteFragment(noteDoc)
    if (!targetFragment) {
      throw new Error(`BlockNote content missing after creating note doc ${noteId}`)
    }

    if (targetFragment !== fragment) {
      copyBlockNoteFragment(fragment, targetFragment)
    }
  }

  createNoteDoc(noteId: string, kind: NoteContentKind): void {
    ensureAttachedNoteDoc(this.rootDoc, noteId, kind)
  }

  deleteNoteDoc(noteId: string): void {
    deleteAttachedNoteDoc(this.rootDoc, noteId)
  }
}

export function createWorkspaceContentStore(rootDoc: Y.Doc): WorkspaceContentStore {
  return new YjsWorkspaceContentStore(rootDoc)
}
