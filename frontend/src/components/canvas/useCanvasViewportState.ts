import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { WorkspaceSocketProviderInstance } from 'shared'
import CursorManager from '@/lib/CursorManager'
import { getCanvasViewport, setCanvasViewport } from '@/hooks/workspaceStorage'
import { defaultCanvasViewport } from './CanvasFlow.config'
import { startExitFocusMode, exitFocusMode } from '@/store/useUIStore'

interface UseCanvasViewportStateOptions {
  workspaceId: string
  canvasId: string
  selectedNodeId?: string | null
  focusedNodeId?: string | null
  deferDefaultViewportRestore?: boolean
  focusMode: boolean
  savedViewport: { x: number; y: number; zoom: number } | null
  provider: WorkspaceSocketProviderInstance
  localUserId: string
  isCursorPresenceSuppressed: () => boolean
  acquireCursorPresenceSuppression: () => () => void
  screenToFlowPosition: ReactFlowInstance['screenToFlowPosition']
  flowToScreenPosition: ReactFlowInstance['flowToScreenPosition']
  setViewport: ReactFlowInstance['setViewport']
  canvasSurfaceRef: RefObject<HTMLDivElement | null>
}

export function useCanvasViewportState({
  workspaceId,
  canvasId,
  selectedNodeId,
  focusedNodeId,
  deferDefaultViewportRestore = false,
  focusMode,
  savedViewport,
  provider,
  localUserId,
  isCursorPresenceSuppressed,
  acquireCursorPresenceSuppression,
  screenToFlowPosition,
  flowToScreenPosition,
  setViewport,
  canvasSurfaceRef,
}: UseCanvasViewportStateOptions) {
  const cursorManagerRef = useRef<CursorManager | null>(null)
  const saveViewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleViewportChange = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      if (focusMode && viewport.zoom < 0.9) {
        exitFocusMode()
        return
      }

      cursorManagerRef.current?.refresh()

      if (focusMode) {
        return
      }

      if (saveViewportTimeoutRef.current) {
        clearTimeout(saveViewportTimeoutRef.current)
      }

      saveViewportTimeoutRef.current = setTimeout(() => {
        setCanvasViewport(workspaceId, canvasId, viewport)
      }, 200)
    },
    [workspaceId, canvasId, focusMode]
  )

  useEffect(() => {
    return () => {
      if (saveViewportTimeoutRef.current) {
        clearTimeout(saveViewportTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const surface = canvasSurfaceRef.current
    if (!surface) {
      return
    }

    const cursorManager = new CursorManager(provider, {
      userId: localUserId,
      isPublishingSuppressed: isCursorPresenceSuppressed,
    })
    cursorManager.setReactFlowInstance({ flowToScreenPosition, screenToFlowPosition } as ReactFlowInstance)
    cursorManager.attach(surface, canvasId)
    cursorManagerRef.current = cursorManager

    return () => {
      if (cursorManagerRef.current === cursorManager) {
        cursorManagerRef.current = null
      }

      cursorManager.destroy()
    }
  }, [
    canvasId,
    canvasSurfaceRef,
    flowToScreenPosition,
    isCursorPresenceSuppressed,
    localUserId,
    provider,
    screenToFlowPosition,
  ])

  useEffect(() => {
    if (!focusMode) {
      return
    }

    return acquireCursorPresenceSuppression()
  }, [acquireCursorPresenceSuppression, focusMode])

  const handleFocusModeExit = useCallback(() => {
    startExitFocusMode()

    setTimeout(() => {
      if (savedViewport) {
        setViewport(savedViewport, { duration: 0 })
      }
      exitFocusMode()
    }, 300)
  }, [savedViewport, setViewport])

  const handleInit = useCallback(
    (instance: { setViewport: (viewport: { x: number; y: number; zoom: number }) => void }) => {
      if (selectedNodeId || focusedNodeId) {
        return
      }

      const savedCanvasViewport = getCanvasViewport(workspaceId, canvasId)
      if (!savedCanvasViewport && deferDefaultViewportRestore) {
        return
      }

      const viewportToRestore = savedCanvasViewport ?? defaultCanvasViewport
      instance.setViewport(viewportToRestore)
      requestAnimationFrame(() => {
        instance.setViewport(viewportToRestore)
      })
    },
    [selectedNodeId, focusedNodeId, deferDefaultViewportRestore, workspaceId, canvasId]
  )

  return {
    handleViewportChange,
    handleFocusModeExit,
    handleInit,
  }
}
