import { useCallback, useEffect } from 'react'

function extractImageFiles(items: DataTransferItemList): File[] {
  const imageFiles: File[] = []
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  return imageFiles
}

interface UseImagePasteOptions {
  onImagesPasted: (files: File[]) => void
}

/** Element-level paste handler for use with onPaste prop */
export function useImagePaste({ onImagesPasted }: UseImagePasteOptions) {
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles = extractImageFiles(items)
      if (imageFiles.length > 0) {
        e.preventDefault()
        onImagesPasted(imageFiles)
      }
    },
    [onImagesPasted]
  )

  return { handlePaste }
}

function isEditingText(): boolean {
  const activeElement = document.activeElement
  return !!(
    activeElement?.closest('.blocknote-editor') ||
    activeElement?.closest('[contenteditable="true"]') ||
    activeElement?.tagName === 'INPUT' ||
    activeElement?.tagName === 'TEXTAREA'
  )
}

/** Document-level paste listener that skips when user is editing text */
export function useDocumentImagePaste({ onImagesPasted }: UseImagePasteOptions) {
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditingText()) return

      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles = extractImageFiles(items)
      if (imageFiles.length > 0) {
        e.preventDefault()
        onImagesPasted(imageFiles)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [onImagesPasted])
}
