import { useLayoutEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { useWorkspace, useEditorUndoManager } from '@/providers/workspace'
import { useNoteBlockNoteFragment, useNoteExists } from '@/hooks/useNoteContent'
import { useFragmentKey } from '@/hooks/useFragmentKey'
import {
  useIsolatedBlockNoteCollaborationProvider,
  type BlockNoteCollaborationProvider,
} from '@/lib/blocknote-collaboration'

interface UseNoteBlockNoteBindingOptions {
  awareness?: 'note' | 'isolated'
  awarenessEnabled?: boolean
}

interface NoteBlockNoteBinding {
  awarenessSource: 'note' | 'isolated'
  editorKey: string
  fragment: Y.XmlFragment | null
  fragmentKey: string
  collaborationProvider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
}

function isUnknownWorkspaceNoteError(error: unknown, noteId: string): boolean {
  return error instanceof Error && error.message === `Unknown workspace note ${noteId}`
}

export function useNoteBlockNoteBinding(
  noteId: string,
  options: UseNoteBlockNoteBindingOptions = {}
): NoteBlockNoteBinding {
  const { yDoc, provider: workspaceProvider } = useWorkspace()
  const undoManager = useEditorUndoManager()
  const shouldUseSharedAwareness = options.awareness !== 'isolated' && (options.awarenessEnabled ?? true)
  const noteExists = useNoteExists(yDoc, noteId)
  const [sharedAwarenessState, setSharedAwarenessState] = useState<{
    awareness: BlockNoteCollaborationProvider['awareness']
    noteId: string
    provider: object
  } | null>(null)

  useLayoutEffect(() => {
    if (!shouldUseSharedAwareness || !noteExists) {
      setSharedAwarenessState((current) => (current === null ? current : null))
      return
    }

    let awareness: BlockNoteCollaborationProvider['awareness']

    try {
      awareness = workspaceProvider.acquireNoteAwareness(noteId)
    } catch (error) {
      if (!isUnknownWorkspaceNoteError(error, noteId)) {
        throw error
      }

      setSharedAwarenessState((current) => (current === null ? current : null))
      return
    }

    const nextState = {
      awareness,
      noteId,
      provider: workspaceProvider,
    }
    setSharedAwarenessState(nextState)

    return () => {
      setSharedAwarenessState((current) =>
        current?.noteId === noteId && current.provider === workspaceProvider ? null : current
      )
      workspaceProvider.releaseNoteAwareness(noteId)
    }
  }, [noteExists, noteId, shouldUseSharedAwareness, workspaceProvider])

  const sharedAwareness =
    shouldUseSharedAwareness &&
    sharedAwarenessState?.noteId === noteId &&
    sharedAwarenessState.provider === workspaceProvider
      ? sharedAwarenessState.awareness
      : null
  const awarenessSource = sharedAwareness ? 'note' : 'isolated'
  const awarenessOverride = awarenessSource === 'note' ? sharedAwareness : null
  const collaborationProvider = useIsolatedBlockNoteCollaborationProvider(workspaceProvider, awarenessOverride)
  const fallbackFragment = useMemo(() => new Y.XmlFragment(), [])
  const fragment = useNoteBlockNoteFragment(yDoc, noteId)
  const fragmentKey = useFragmentKey(fragment ?? fallbackFragment)
  const editorKey = `${fragmentKey}:${awarenessSource}`

  return {
    awarenessSource,
    editorKey,
    fragment,
    fragmentKey,
    collaborationProvider,
    undoManager,
  }
}
