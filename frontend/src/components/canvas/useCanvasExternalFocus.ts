import { useCallback, useEffect, useRef } from 'react'
import type { CanvasItem } from 'shared'
import { getCanvasViewport } from '@/hooks/workspaceStorage'
import { resolveFocusModeTargetAction } from './focusModeNavigation'
import { exitFocusMode } from '@/store/useUIStore'

interface UseCanvasExternalFocusOptions {
  canvas: CanvasItem
  workspaceId: string
  selectedNodeId?: string | null
  selectedNodeIds: readonly string[]
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

function areNodeIdArraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function useCanvasExternalFocus({
  canvas,
  workspaceId,
  selectedNodeId,
  selectedNodeIds,
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
  const selectedNodeIdsRef = useRef<readonly string[]>(selectedNodeIds)
  selectedNodeIdsRef.current = selectedNodeIds
  const setSelectedNodeIdsIfChanged = useCallback(
    (nodeIds: string[]) => {
      if (!areNodeIdArraysEqual(selectedNodeIdsRef.current, nodeIds)) {
        setSelectedNodeIds(nodeIds)
      }
    },
    [setSelectedNodeIds]
  )

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
        setSelectedNodeIdsIfChanged([selectedNodeId])
        onNodeFocused?.()
        return
      }

      if (focusModeAction.type === 'exit') {
        exitFocusMode()
      }
    }

    setSelectedNodeIdsIfChanged([selectedNodeId])

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
    setSelectedNodeIdsIfChanged,
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
        setSelectedNodeIdsIfChanged([focusedNodeId])
        onNodeFocused?.()
        return
      }

      if (focusModeAction.type === 'exit') {
        exitFocusMode()
      }
    }

    setSelectedNodeIdsIfChanged([focusedNodeId])

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
    setSelectedNodeIdsIfChanged,
  ])
}
