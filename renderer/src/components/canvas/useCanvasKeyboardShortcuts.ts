import { useCallback } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toggleFullScreenMode } from '@/store/useUIStore'

type Direction = 'up' | 'down' | 'left' | 'right'

interface UseCanvasKeyboardShortcutsOptions {
  undo: () => void
  redo: () => void
  navigateNodes: (direction: Direction) => void
  zoomTo: (zoomLevel: number, options?: { duration?: number }) => void
}

export function useCanvasKeyboardShortcuts({ undo, redo, navigateNodes, zoomTo }: UseCanvasKeyboardShortcutsOptions) {
  const isEditing = useCallback(() => {
    const activeElement = document.activeElement
    return activeElement?.closest('.blocknote-editor') || activeElement?.closest('[contenteditable="true"]')
  }, [])

  useHotkeys(
    'mod+z',
    (event) => {
      event.preventDefault()
      undo()
    },
    { enableOnContentEditable: false, enableOnFormTags: false },
    [undo]
  )

  useHotkeys(
    'shift+mod+z',
    (event) => {
      event.preventDefault()
      redo()
    },
    { enableOnContentEditable: false, enableOnFormTags: false },
    [redo]
  )

  useHotkeys(
    'f',
    (event) => {
      event.preventDefault()
      toggleFullScreenMode()
    },
    {
      enableOnFormTags: false,
      enableOnContentEditable: false,
    }
  )

  useHotkeys(
    '0',
    (event) => {
      event.preventDefault()
      zoomTo(1, { duration: 100 })
    },
    {
      enableOnFormTags: false,
      enableOnContentEditable: false,
    },
    [zoomTo]
  )

  useHotkeys(
    'left',
    (event) => {
      if (!isEditing()) {
        event.preventDefault()
        navigateNodes('left')
      }
    },
    [isEditing, navigateNodes]
  )

  useHotkeys(
    'right',
    (event) => {
      if (!isEditing()) {
        event.preventDefault()
        navigateNodes('right')
      }
    },
    [isEditing, navigateNodes]
  )

  useHotkeys(
    'up',
    (event) => {
      if (!isEditing()) {
        event.preventDefault()
        navigateNodes('up')
      }
    },
    [isEditing, navigateNodes]
  )

  useHotkeys(
    'down',
    (event) => {
      if (!isEditing()) {
        event.preventDefault()
        navigateNodes('down')
      }
    },
    [isEditing, navigateNodes]
  )
}
