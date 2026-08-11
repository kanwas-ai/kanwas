import { useCallback, useRef, useState } from 'react'
import { SUPPORTED_FILE_EXTENSIONS } from 'shared/constants'
import { SUPPORTED_IMAGE_TYPES } from './constants'
import { AddLinkModal } from './AddLinkModal'

interface ContextMenuPosition {
  x: number
  y: number
}

interface UseCanvasContextMenuAddActionsOptions {
  canvasId: string
  contextMenu: ContextMenuPosition | null
  screenToFlowPosition: (position: ContextMenuPosition) => ContextMenuPosition
  addLinkNode: (options: { url: string; canvasId?: string; position?: ContextMenuPosition }) => string | null
  addImageNode: (options: { file: File; canvasId?: string; position?: ContextMenuPosition }) => Promise<string>
  addFileNode: (options: { file: File; canvasId?: string; position?: ContextMenuPosition }) => Promise<string>
}

export function useCanvasContextMenuAddActions({
  canvasId,
  contextMenu,
  screenToFlowPosition,
  addLinkNode,
  addImageNode,
  addFileNode,
}: UseCanvasContextMenuAddActionsOptions) {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [pendingPosition, setPendingPosition] = useState<ContextMenuPosition | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getMenuPosition = useCallback(() => {
    if (!contextMenu) return null
    return screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
  }, [contextMenu, screenToFlowPosition])

  const handleAddLink = useCallback(() => {
    const position = getMenuPosition()
    if (!position) return

    setPendingPosition(position)
    setIsLinkModalOpen(true)
  }, [getMenuPosition])

  const handleLinkSubmit = useCallback(
    (url: string) => {
      if (!pendingPosition) return
      addLinkNode({ url, canvasId, position: pendingPosition })
      setPendingPosition(null)
    },
    [addLinkNode, canvasId, pendingPosition]
  )

  const handleAddImage = useCallback(() => {
    const position = getMenuPosition()
    if (!position) return

    setPendingPosition(position)
    imageFileInputRef.current?.click()
  }, [getMenuPosition])

  const handleAddFile = useCallback(() => {
    const position = getMenuPosition()
    if (!position) return

    setPendingPosition(position)
    fileInputRef.current?.click()
  }, [getMenuPosition])

  const handleImageFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file || !pendingPosition) return

      try {
        await addImageNode({ file, canvasId, position: pendingPosition })
      } catch {
        // Error already shown via toast in mutation
      } finally {
        setPendingPosition(null)
      }
    },
    [addImageNode, canvasId, pendingPosition]
  )

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''

      if (!file || !pendingPosition) return

      try {
        await addFileNode({ file, canvasId, position: pendingPosition })
      } catch {
        // Error already shown via toast in hook
      } finally {
        setPendingPosition(null)
      }
    },
    [addFileNode, canvasId, pendingPosition]
  )

  const controls = (
    <>
      <input
        ref={imageFileInputRef}
        type="file"
        accept={SUPPORTED_IMAGE_TYPES.join(',')}
        onChange={handleImageFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_FILE_EXTENSIONS.map((ext: string) => `.${ext}`).join(',')}
        onChange={handleFileChange}
        className="hidden"
      />
      <AddLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => {
          setIsLinkModalOpen(false)
          setPendingPosition(null)
        }}
        onSubmit={handleLinkSubmit}
      />
    </>
  )

  return {
    controls,
    handleAddLink,
    handleAddImage,
    handleAddFile,
  }
}
