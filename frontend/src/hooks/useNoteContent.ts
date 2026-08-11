import { useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { findNoteBlockNoteFragment, getNoteContentKind, getNoteDoc, isNoteContentKind } from '@/lib/workspaceNoteDoc'

function useNoteSnapshot<T>(rootDoc: Y.Doc, noteId: string, readSnapshot: (noteDoc: Y.Doc | null) => T): T {
  const lastKnownDocRef = useRef<Y.Doc | null>(null)

  const resolveNoteDoc = (): Y.Doc | null => {
    const noteDoc = getNoteDoc(rootDoc, noteId)
    if (noteDoc) {
      lastKnownDocRef.current = noteDoc
      return noteDoc
    }

    return lastKnownDocRef.current
  }

  return useSyncExternalStore(
    (callback) => {
      const handleRootTransaction = () => callback()
      const handleNoteUpdate = () => callback()
      const noteDoc = resolveNoteDoc()

      rootDoc.on('afterTransaction', handleRootTransaction)
      noteDoc?.on('updateV2', handleNoteUpdate)

      return () => {
        rootDoc.off('afterTransaction', handleRootTransaction)
        noteDoc?.off('updateV2', handleNoteUpdate)
      }
    },
    () => readSnapshot(resolveNoteDoc()),
    () => readSnapshot(resolveNoteDoc())
  )
}

export function useNoteBlockNoteFragment(rootDoc: Y.Doc, noteId: string): Y.XmlFragment | null {
  const lastKnownFragmentRef = useRef<Y.XmlFragment | null>(null)

  return useNoteSnapshot(rootDoc, noteId, (noteDoc) => {
    if (noteDoc && isNoteContentKind(getNoteContentKind(noteDoc))) {
      const fragment = findNoteBlockNoteFragment(noteDoc)
      if (fragment) {
        lastKnownFragmentRef.current = fragment
        return fragment
      }
    }

    return lastKnownFragmentRef.current
  })
}

export function useNoteExists(rootDoc: Y.Doc, noteId: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const handleRootTransaction = () => callback()

      rootDoc.on('afterTransaction', handleRootTransaction)

      return () => {
        rootDoc.off('afterTransaction', handleRootTransaction)
      }
    },
    () => getNoteDoc(rootDoc, noteId) !== undefined,
    () => getNoteDoc(rootDoc, noteId) !== undefined
  )
}
