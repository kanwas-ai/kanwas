import { useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { useTextSelectionStore } from '@/providers/workspace'
import { persistSelectionKey } from '@/lib/persist-selection-extension'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

interface UseBlockNoteTextSelectionSyncOptions {
  editor: BlockNoteEditorInstance
  nodeId: string
  documentName: string
}

export function useBlockNoteTextSelectionSync({ editor, nodeId, documentName }: UseBlockNoteTextSelectionSyncOptions) {
  const textSelectionStore = useTextSelectionStore()
  const hadSelectionRef = useRef(false)

  useEffect(() => {
    const tiptap = editor._tiptapEditor

    const handleSelectionChange = () => {
      const text = editor.getSelectedText()

      if (text && text.trim()) {
        const selection = editor.getSelection()
        const blockCount = selection?.blocks?.length || 1
        textSelectionStore.setTextSelection({ nodeId, nodeName: documentName, text, lineCount: blockCount })
      } else if (tiptap.isFocused) {
        textSelectionStore.setTextSelection(null)
      }
    }

    const handleFocus = () => {
      const currentTextSelection = textSelectionStore.getSnapshot()
      if (currentTextSelection && currentTextSelection.nodeId !== nodeId) {
        textSelectionStore.setTextSelection(null)
      }
    }

    tiptap.on('selectionUpdate', handleSelectionChange)
    tiptap.on('focus', handleFocus)

    return () => {
      tiptap.off('selectionUpdate', handleSelectionChange)
      tiptap.off('focus', handleFocus)
    }
  }, [documentName, editor, nodeId, textSelectionStore])

  useEffect(() => {
    const tiptap = editor._tiptapEditor

    const syncPersistedSelection = () => {
      const thisNodeHasSelection = textSelectionStore.getSnapshot()?.nodeId === nodeId

      if (thisNodeHasSelection) {
        hadSelectionRef.current = true
        return
      }

      if (!hadSelectionRef.current) {
        return
      }

      hadSelectionRef.current = false
      const view = tiptap.view
      if (view) {
        view.dispatch(
          view.state.tr.setMeta(persistSelectionKey, { hasFocus: true, from: 0, to: 0 }).setMeta('addToHistory', false)
        )
      }
    }

    syncPersistedSelection()
    return textSelectionStore.subscribe(syncPersistedSelection)
  }, [editor, nodeId, textSelectionStore])
}
