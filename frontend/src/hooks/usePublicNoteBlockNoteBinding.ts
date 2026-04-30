import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ySyncPluginKey } from 'y-prosemirror'
import * as Y from 'yjs'
import { findNoteBlockNoteFragment, getNoteContentKind } from 'shared/note-doc'
import type { BlockNoteCollaborationProvider } from '@/lib/blocknote-collaboration'
import { useFragmentKey } from '@/hooks/useFragmentKey'
import { usePublicNote } from '@/providers/public-note'

function usePublicNoteBlockNoteFragment(noteDoc: Y.Doc): Y.XmlFragment | null {
  const lastKnownFragmentRef = useRef<Y.XmlFragment | null>(null)

  return useSyncExternalStore(
    (callback) => {
      const handleUpdate = () => callback()
      noteDoc.on('updateV2', handleUpdate)
      return () => {
        noteDoc.off('updateV2', handleUpdate)
      }
    },
    () => {
      if (getNoteContentKind(noteDoc) === 'blockNote') {
        const fragment = findNoteBlockNoteFragment(noteDoc)
        if (fragment) {
          lastKnownFragmentRef.current = fragment
          return fragment
        }
      }

      return lastKnownFragmentRef.current
    },
    () => lastKnownFragmentRef.current
  )
}

export function usePublicNoteBlockNoteBinding(): {
  fragment: Y.XmlFragment | null
  editorKey: string
  collaborationProvider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager | null
} {
  const { yDoc, provider } = usePublicNote()
  const fragment = usePublicNoteBlockNoteFragment(yDoc)
  const fallbackFragment = useMemo(() => new Y.XmlFragment(), [])
  const editorKey = useFragmentKey(fragment ?? fallbackFragment)
  const collaborationProvider = useMemo<BlockNoteCollaborationProvider>(
    () => ({ awareness: provider.awareness }),
    [provider]
  )
  const undoManager = useMemo(
    () =>
      fragment
        ? new Y.UndoManager(fragment, {
            trackedOrigins: new Set([ySyncPluginKey]),
            captureTransaction: (transaction) => transaction.meta.get('addToHistory') !== false,
          })
        : null,
    [fragment]
  )

  useEffect(() => {
    return () => {
      undoManager?.destroy()
    }
  }, [undoManager])

  return {
    fragment,
    editorKey,
    collaborationProvider,
    undoManager,
  }
}
