import { useEffect } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { useWorkspace } from '@/providers/workspace'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

export function useCanvasCursorSuppressionWhileEditorFocused(editor: BlockNoteEditorInstance) {
  const { acquireCursorPresenceSuppression } = useWorkspace()

  useEffect(() => {
    const tiptap = editor._tiptapEditor
    let releaseSuppression: (() => void) | null = tiptap.isFocused ? acquireCursorPresenceSuppression() : null

    const handleFocus = () => {
      if (!releaseSuppression) {
        releaseSuppression = acquireCursorPresenceSuppression()
      }
    }

    const handleBlur = () => {
      releaseSuppression?.()
      releaseSuppression = null
    }

    tiptap.on('focus', handleFocus)
    tiptap.on('blur', handleBlur)

    return () => {
      tiptap.off('focus', handleFocus)
      tiptap.off('blur', handleBlur)
      handleBlur()
    }
  }, [editor, acquireCursorPresenceSuppression])
}
