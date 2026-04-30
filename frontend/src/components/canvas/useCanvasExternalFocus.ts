import { useEffect } from 'react'
import type { CanvasItem } from 'shared'
import { getCanvasViewport } from '@/hooks/workspaceStorage'
import { resolveFocusModeTargetAction } from './focusModeNavigation'
import { exitFocusMode } from '@/store/useUIStore'

interface UseCanvasExternalFocusOptions {
  canvas: CanvasItem
  workspaceId: string
  selectedNodeId?: string | null
  focusedNodeId?: string | null
  fitSelectedNode: boolean
  suppressSelectedNodeFallbackFit?: boolean
  focusMode: boolean
  focusModeNodeId: string | null
  savedViewport: { x: number; y: number; zoom: number } | null
  enterFocusMode: (
    nodeId: string,
    nodeType: 'blockNote',
    viewport: { x: number; y: number; zoom: number },
    isSwitching?: boolean
  ) => void
  getViewport: () => { x: number; y: number; zoom: number }
  setViewport: (viewport: { x: number; y: number; zoom: number }, options?: { duration?: number }) => void
  fitNodeInView: (nodeId: string) => void
  focusNodeAt100: (nodeId: string) => { found: boolean; moved: boolean }
  setSelectedNodeIds: (nodeIds: string[]) => void
  onNodeFocused?: () => void
}

export function useCanvasExternalFocus({
  canvas,
  workspaceId,
  selectedNodeId,
  focusedNodeId,
  fitSelectedNode,
  suppressSelectedNodeFallbackFit = false,
  focusMode,
  focusModeNodeId,
  savedViewport,
  enterFocusMode,
  getViewport,
  setViewport,
  fitNodeInView,
  focusNodeAt100,
  setSelectedNodeIds,
  onNodeFocused,
}: UseCanvasExternalFocusOptions) {
  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    const item = canvas.items.find((candidate) => candidate.id === selectedNodeId)
    if (!item) {
      return
    }

    if (item.kind === 'node') {
      const focusModeAction = resolveFocusModeTargetAction({
        focusMode,
        focusedNodeId: focusModeNodeId,
        targetNodeId: selectedNodeId,
        targetNodeType: item.xynode.type,
      })

      if (focusModeAction.type === 'switch') {
        enterFocusMode(selectedNodeId, focusModeAction.nodeType, savedViewport || getViewport(), true)
        setSelectedNodeIds([selectedNodeId])
        onNodeFocused?.()
        return
      }

      if (focusModeAction.type === 'exit') {
        exitFocusMode()
      }
    }

    setSelectedNodeIds([selectedNodeId])

    const canvasViewport = getCanvasViewport(workspaceId, canvas.id)
    if (canvasViewport) {
      setViewport(canvasViewport, { duration: 0 })
    }

    if (fitSelectedNode || (!canvasViewport && !suppressSelectedNodeFallbackFit)) {
      requestAnimationFrame(() => {
        fitNodeInView(selectedNodeId)
        onNodeFocused?.()
      })
      return
    }

    onNodeFocused?.()
  }, [
    canvas,
    fitNodeInView,
    fitSelectedNode,
    focusMode,
    focusModeNodeId,
    getViewport,
    enterFocusMode,
    onNodeFocused,
    savedViewport,
    selectedNodeId,
    setSelectedNodeIds,
    setViewport,
    suppressSelectedNodeFallbackFit,
    workspaceId,
  ])

  useEffect(() => {
    if (!focusedNodeId) {
      return
    }

    const item = canvas.items.find((candidate) => candidate.id === focusedNodeId)
    if (!item) {
      return
    }

    if (item.kind === 'node') {
      const focusModeAction = resolveFocusModeTargetAction({
        focusMode,
        focusedNodeId: focusModeNodeId,
        targetNodeId: focusedNodeId,
        targetNodeType: item.xynode.type,
      })

      if (focusModeAction.type === 'switch') {
        enterFocusMode(focusedNodeId, focusModeAction.nodeType, savedViewport || getViewport(), true)
        setSelectedNodeIds([focusedNodeId])
        onNodeFocused?.()
        return
      }

      if (focusModeAction.type === 'exit') {
        exitFocusMode()
      }
    }

    setSelectedNodeIds([focusedNodeId])

    requestAnimationFrame(() => {
      const result = focusNodeAt100(focusedNodeId)
      if (!result.found) {
        setTimeout(() => {
          focusNodeAt100(focusedNodeId)
          onNodeFocused?.()
        }, 100)
        return
      }

      onNodeFocused?.()
    })
  }, [
    canvas,
    focusMode,
    focusModeNodeId,
    focusedNodeId,
    focusNodeAt100,
    getViewport,
    enterFocusMode,
    onNodeFocused,
    savedViewport,
    setSelectedNodeIds,
  ])
}
