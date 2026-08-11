import { useMemo } from 'react'
import * as Y from 'yjs'
import { useWorkspace, useEditorUndoManager } from '@/providers/workspace'
import { useNoteBlockNoteFragment } from '@/hooks/useNoteContent'
import { useFragmentKey } from '@/hooks/useFragmentKey'
import {
  useLocalBlockNoteCollaborationProvider,
  type BlockNoteCollaborationProvider,
} from '@/lib/blocknote-collaboration'

interface NoteBlockNoteBinding {
  editorKey: string
  fragment: Y.XmlFragment | null
  fragmentKey: string
  collaborationProvider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
}

export function useNoteBlockNoteBinding(noteId: string): NoteBlockNoteBinding {
  const { yDoc } = useWorkspace()
  const undoManager = useEditorUndoManager()
  const collaborationProvider = useLocalBlockNoteCollaborationProvider()
  const fallbackFragment = useMemo(() => new Y.XmlFragment(), [])
  const fragment = useNoteBlockNoteFragment(yDoc, noteId)
  const fragmentKey = useFragmentKey(fragment ?? fallbackFragment)
  const editorKey = fragmentKey

  return {
    editorKey,
    fragment,
    fragmentKey,
    collaborationProvider,
    undoManager,
  }
}
