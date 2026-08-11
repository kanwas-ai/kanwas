import { useCallback, useEffect, useRef } from 'react'
import type { Node as XYNode, NodeMouseHandler } from '@xyflow/react'
import { useNodesSelection } from '@/providers/nodes-selection'

interface UseCanvasSelectionOptions {
  selectedNodeIds: string[]
  programmaticSelectedNodeId?: string | null
  setSelectedNodeIds: (nodeIds: string[]) => void
  setIsMultiDragActive: (isActive: boolean) => void
  clearContextMenu: () => void
}

function areNodeIdArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((nodeId, index) => nodeId === right[index])
}

export function useCanvasSelection({
  selectedNodeIds,
  programmaticSelectedNodeId,
  setSelectedNodeIds,
  setIsMultiDragActive,
  clearContextMenu,
}: UseCanvasSelectionOptions) {
  const { state: nodesSelectionState } = useNodesSelection()
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  selectedNodeIdsRef.current = selectedNodeIds
  const programmaticSelectedNodeIdRef = useRef(programmaticSelectedNodeId)
  programmaticSelectedNodeIdRef.current = programmaticSelectedNodeId

  useEffect(() => {
    nodesSelectionState.selectedNodeIds = selectedNodeIds
  }, [nodesSelectionState, selectedNodeIds])

  const deselectNode = useCallback(
    (nodeId: string) => {
      const nextSelectedNodeIds = selectedNodeIdsRef.current.filter((id) => id !== nodeId)
      setSelectedNodeIds(nextSelectedNodeIds)
    },
    [setSelectedNodeIds]
  )

  const selectOnlyNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds([nodeId])
    },
    [setSelectedNodeIds]
  )

  const handleSelectionChange = useCallback(
    ({ nodes }: { nodes: XYNode[] }) => {
      const nextSelectedIds = nodes.map((node) => node.id)
      const currentSelectedIds = selectedNodeIdsRef.current
      if (areNodeIdArraysEqual(currentSelectedIds, nextSelectedIds)) {
        return
      }

      const programmaticNodeId = programmaticSelectedNodeIdRef.current
      const isTransientProgrammaticClear =
        nextSelectedIds.length === 0 && currentSelectedIds.length === 1 && currentSelectedIds[0] === programmaticNodeId
      if (isTransientProgrammaticClear) {
        return
      }

      setSelectedNodeIds(nextSelectedIds)
    },
    [setSelectedNodeIds]
  )

  const handlePaneClick = useCallback(() => {
    setIsMultiDragActive(false)
    clearContextMenu()

    setSelectedNodeIds([])
  }, [clearContextMenu, setIsMultiDragActive, setSelectedNodeIds])

  const handleNodeClick = useCallback<NodeMouseHandler<XYNode>>(
    (event, node) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }

      setSelectedNodeIds([node.id])
    },
    [setSelectedNodeIds]
  )

  return {
    deselectNode,
    selectOnlyNode,
    handleSelectionChange,
    handlePaneClick,
    handleNodeClick,
  }
}
