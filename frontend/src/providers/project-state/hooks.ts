import { useCallback } from 'react'
import { useProjectState } from './ProjectStateContext'
import type { BlockNoteEditor } from '@blocknote/core'
import { ref } from 'valtio'

export const useSetEditor = () => {
  const { state } = useProjectState()

  return useCallback(
    (id: string, editor: BlockNoteEditor) => {
      state.editors.set(id, ref(editor))
    },
    [state]
  )
}

export const useGetEditor = () => {
  const { state } = useProjectState()

  return useCallback(
    (id: string): BlockNoteEditor | undefined => {
      return state.editors.get(id)
    },
    [state.editors]
  )
}

export const useRemoveEditor = () => {
  const { state } = useProjectState()

  return useCallback(
    (id: string) => {
      state.editors.delete(id)
    },
    [state]
  )
}

export const useSetMountedKanwasEditor = () => {
  const { state } = useProjectState()

  return useCallback(
    (editorNodeId: string, editor: BlockNoteEditor) => {
      state.mountedKanwasEditor = {
        editorNodeId,
        editor: ref(editor) as unknown as BlockNoteEditor,
      }
    },
    [state]
  )
}

export const useGetMountedKanwasEditor = () => {
  const { state } = useProjectState()

  return useCallback(() => state.mountedKanwasEditor, [state])
}

export const useClearMountedKanwasEditor = () => {
  const { state } = useProjectState()

  return useCallback(
    (editorNodeId?: string) => {
      if (editorNodeId && state.mountedKanwasEditor?.editorNodeId !== editorNodeId) {
        return
      }

      state.mountedKanwasEditor = null
    },
    [state]
  )
}
