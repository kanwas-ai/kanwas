import { useCallback, useEffect, useRef } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
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
  setViewport: ReactFlowInstance['setViewport']
}

export function useCanvasViewportState({
  workspaceId,
  canvasId,
  selectedNodeId,
  focusedNodeId,
  deferDefaultViewportRestore = false,
  focusMode,
  savedViewport,
  setViewport,
}: UseCanvasViewportStateOptions) {
  const saveViewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleViewportChange = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      if (focusMode && viewport.zoom < 0.9) {
        exitFocusMode()
        return
      }

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
