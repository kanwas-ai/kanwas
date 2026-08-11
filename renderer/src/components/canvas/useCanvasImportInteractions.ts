import { useCallback, useEffect, useRef, useState, type RefObject, type FocusEvent, type MouseEvent } from 'react'
import { useDocumentCanvasPaste } from '@/hooks/useCanvasPaste'
import { classifyCanvasDataTransfer, offsetCanvasImportPosition } from '@/lib/canvasExternalContent'
import { getElementFromEventTarget, shouldClaimCanvasPaste } from '@/lib/canvasPasteTargeting'
import { useSelectionAutoPan } from './useSelectionAutoPan'
import {
  useAddNode,
  useAddBlockNoteNodeFromImport,
  useAddImageNode,
  useAddFileNode,
  useAddAudioNode,
  useAddLinkNode,
  useAddTextNode,
  useAddStickyNote,
} from './hooks'

interface Position {
  x: number
  y: number
}

interface UseCanvasImportInteractionsOptions {
  canvasId: string
  screenToFlowPosition: (position: Position) => Position
  canvasContainerRef: RefObject<HTMLDivElement | null>
}

export function useCanvasImportInteractions({
  canvasId,
  screenToFlowPosition,
  canvasContainerRef,
}: UseCanvasImportInteractionsOptions) {
  const addNode = useAddNode()
  const addBlockNoteNodeFromImport = useAddBlockNoteNodeFromImport()
  const addTextNode = useAddTextNode()
  const addStickyNote = useAddStickyNote()
  const addImageNode = useAddImageNode()
  const addFileNode = useAddFileNode()
  const addAudioNode = useAddAudioNode()
  const addLinkNode = useAddLinkNode()
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const lastCanvasMousePositionRef = useRef<Position | null>(null)
  const lastCanvasPointerTargetRef = useRef<Element | null>(null)
  const isCanvasPasteActiveRef = useRef(false)

  useSelectionAutoPan(canvasContainerRef)

  const importCanvasDataTransfer = useCallback(
    (dataTransfer: DataTransfer, basePosition: Position) => {
      const imports = classifyCanvasDataTransfer(dataTransfer)
      if (imports.length === 0) {
        return false
      }

      imports.forEach((item, index) => {
        const position = offsetCanvasImportPosition(basePosition, index)

        if (item.kind === 'image') {
          addImageNode({ file: item.file, canvasId, position }).catch(() => {})
          return
        }

        if (item.kind === 'audio') {
          addAudioNode({ file: item.file, canvasId, position }).catch(() => {})
          return
        }

        if (item.kind === 'file') {
          addFileNode({ file: item.file, canvasId, position }).catch(() => {})
          return
        }

        if (item.kind === 'link') {
          addLinkNode({ url: item.url, canvasId, position })
          return
        }

        addBlockNoteNodeFromImport({
          content: item.content,
          format: item.format,
          source: item.source,
          canvasId,
          position,
        })
      })

      return true
    },
    [addAudioNode, addBlockNoteNodeFromImport, addFileNode, addImageNode, addLinkNode, canvasId]
  )

  const getPastePosition = useCallback(() => {
    if (lastCanvasMousePositionRef.current) {
      return screenToFlowPosition(lastCanvasMousePositionRef.current)
    }

    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
  }, [screenToFlowPosition])

  const getPastePointerTarget = useCallback(() => {
    const position = lastCanvasMousePositionRef.current
    if (position && typeof document.elementFromPoint === 'function') {
      return document.elementFromPoint(position.x, position.y) ?? lastCanvasPointerTargetRef.current
    }

    return lastCanvasPointerTargetRef.current
  }, [])

  const handleDocumentPaste = useCallback(
    (event: ClipboardEvent) => {
      const dataTransfer = event.clipboardData
      if (!dataTransfer) {
        return
      }

      if (importCanvasDataTransfer(dataTransfer, getPastePosition())) {
        event.preventDefault()
      }
    },
    [getPastePosition, importCanvasDataTransfer]
  )

  useEffect(() => {
    isCanvasPasteActiveRef.current = false
  }, [canvasId])

  const shouldClaimDocumentPaste = useCallback(
    (event: ClipboardEvent) => {
      return shouldClaimCanvasPaste({
        canvasActive: isCanvasPasteActiveRef.current,
        activeElement: document.activeElement,
        pointerTarget: getPastePointerTarget(),
        clipboardHasImportableContent: Boolean(
          event.clipboardData && classifyCanvasDataTransfer(event.clipboardData).length > 0
        ),
      })
    },
    [getPastePointerTarget]
  )

  useDocumentCanvasPaste({
    onPaste: handleDocumentPaste,
    shouldHandlePaste: shouldClaimDocumentPaste,
    shouldBypassActiveTextInput: shouldClaimDocumentPaste,
  })

  const handleCanvasFocusCapture = useCallback(() => {
    isCanvasPasteActiveRef.current = true
  }, [])

  const handleCanvasBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    if (lastCanvasMousePositionRef.current) {
      return
    }

    isCanvasPasteActiveRef.current = false
  }, [])

  const handleCanvasMouseEnter = useCallback((event: MouseEvent<HTMLDivElement>) => {
    isCanvasPasteActiveRef.current = true
    lastCanvasPointerTargetRef.current = getElementFromEventTarget(event.target)
  }, [])

  const handleCanvasMouseLeave = useCallback(() => {
    isCanvasPasteActiveRef.current = false
    lastCanvasPointerTargetRef.current = null
    lastCanvasMousePositionRef.current = null
  }, [])

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const hasImportableItems = Array.from(event.dataTransfer.items).some(
      (item) => item.kind === 'file' || item.kind === 'string'
    )
    if (hasImportableItems) {
      setIsDraggingOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom
    ) {
      setIsDraggingOver(false)
    }
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDraggingOver(false)

      importCanvasDataTransfer(event.dataTransfer, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [importCanvasDataTransfer, screenToFlowPosition]
  )

  const rememberCanvasPointer = useCallback((event: MouseEvent<HTMLDivElement>) => {
    lastCanvasPointerTargetRef.current = getElementFromEventTarget(event.target)
    const rect = event.currentTarget.getBoundingClientRect()
    lastCanvasMousePositionRef.current = {
      x: Math.min(Math.max(event.clientX, rect.left), rect.right),
      y: Math.min(Math.max(event.clientY, rect.top), rect.bottom),
    }
  }, [])

  const handleCanvasMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      rememberCanvasPointer(event)
    },
    [rememberCanvasPointer]
  )

  const handleCanvasMouseDownCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      isCanvasPasteActiveRef.current = true
      rememberCanvasPointer(event)
    },
    [rememberCanvasPointer]
  )

  return {
    addNode,
    addTextNode,
    addStickyNote,
    addImageNode,
    addFileNode,
    addLinkNode,
    isDraggingOver,
    handleCanvasFocusCapture,
    handleCanvasBlurCapture,
    handleCanvasMouseEnter,
    handleCanvasMouseLeave,
    handleCanvasMouseDownCapture,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleCanvasMouseMove,
  }
}
