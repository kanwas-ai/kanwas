import * as Y from 'yjs'
import { getNoteContentKind, type DocState, type NoteContentKind, type WorkspaceDocKind } from './room-types.js'

interface CreateDocStateOptions {
  destroyDocOnTeardown?: boolean
  doc: Y.Doc
  generation: number
  kind: WorkspaceDocKind
  loaded: boolean
  noteId?: string
  noteKind?: NoteContentKind | null
  onDocumentUpdate: (update: Uint8Array, origin: unknown, state: DocState) => void
}

export function createDocState(options: CreateDocStateOptions): DocState {
  const docId = options.kind === 'root' ? 'root' : options.noteId
  if (!docId) {
    throw new Error('Note doc state requires a noteId')
  }

  const state: DocState = {
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

  options.doc.on('updateV2', handleDocumentUpdate)

  state.teardown = () => {
    options.doc.off('updateV2', handleDocumentUpdate)
    if (options.destroyDocOnTeardown) {
      options.doc.destroy()
    }
  }

  return state
}
