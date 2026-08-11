import { useEffect } from 'react'
import { isEditingTextInput } from '@/lib/canvasExternalContent'

interface UseDocumentCanvasPasteOptions {
  onPaste: (event: ClipboardEvent) => void
  shouldHandlePaste?: (event: ClipboardEvent) => boolean
  shouldBypassActiveTextInput?: (event: ClipboardEvent) => boolean
}

export function useDocumentCanvasPaste({
  onPaste,
  shouldHandlePaste,
  shouldBypassActiveTextInput,
}: UseDocumentCanvasPasteOptions) {
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (shouldHandlePaste && !shouldHandlePaste(event)) {
        return
      }

      if (isEditingTextInput() && !shouldBypassActiveTextInput?.(event)) {
        return
      }

      onPaste(event)

      if (event.defaultPrevented) {
        event.stopPropagation()
      }
    }

    document.addEventListener('paste', handlePaste, true)
    return () => document.removeEventListener('paste', handlePaste, true)
  }, [onPaste, shouldHandlePaste, shouldBypassActiveTextInput])
}
