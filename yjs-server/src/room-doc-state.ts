import { Awareness } from 'y-protocols/awareness.js'
import * as Y from 'yjs'
import { getNoteContentKind, type DocState, type NoteContentKind, type WorkspaceDocKind } from './room-types.js'

type AwarenessChanges = { added: number[]; updated: number[]; removed: number[] }

interface CreateDocStateOptions {
  destroyDocOnTeardown?: boolean
  doc: Y.Doc
  generation: number
  kind: WorkspaceDocKind
  loaded: boolean
  noteId?: string
  noteKind?: NoteContentKind | null
  onAwarenessUpdate: (changes: AwarenessChanges, origin: unknown, state: DocState) => void
  onDocumentUpdate: (update: Uint8Array, origin: unknown, state: DocState) => void
}

export function createDocState(options: CreateDocStateOptions): DocState {
  const docId = options.kind === 'root' ? 'root' : options.noteId
  if (!docId) {
    throw new Error('Note doc state requires a noteId')
  }

  const state: DocState = {
    awareness: new Awareness(options.doc),
    awarenessOrigin: { docId, socketId: options.kind === 'root' ? '__root_awareness__' : '__note_awareness__' },
    doc: options.doc,
    docOrigin: { docId, socketId: options.kind === 'root' ? '__root_doc__' : '__note_doc__' },
    generation: options.generation,
    kind: options.kind,
    loaded: options.loaded,
    noteId: options.noteId,
    noteKind: options.kind === 'note' ? (options.noteKind ?? getNoteContentKind(options.doc)) : undefined,
    teardown: () => {},
  }

  const handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    options.onDocumentUpdate(update, origin, state)
  }

  const handleAwarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    options.onAwarenessUpdate(changes, origin, state)
  }

  options.doc.on('updateV2', handleDocumentUpdate)
  state.awareness.on('update', handleAwarenessUpdate)

  state.teardown = () => {
    options.doc.off('updateV2', handleDocumentUpdate)
    state.awareness.off('update', handleAwarenessUpdate)
    state.awareness.destroy()
    if (options.destroyDocOnTeardown) {
      options.doc.destroy()
    }
  }

  return state
}
