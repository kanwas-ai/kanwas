import { useCallback, useEffect, useRef } from 'react'
import type { Node as XYNode, NodeMouseHandler } from '@xyflow/react'
import { useNodesSelection } from '@/providers/nodes-selection'

interface UseCanvasSelectionOptions {
  selectedNodeIds: string[]
  setSelectedNodeIds: (nodeIds: string[]) => void
  setIsMultiDragActive: (isActive: boolean) => void
  clearContextMenu: () => void
}

export function useCanvasSelection({
  selectedNodeIds,
  setSelectedNodeIds,
  setIsMultiDragActive,
  clearContextMenu,
}: UseCanvasSelectionOptions) {
  const { state: nodesSelectionState } = useNodesSelection()
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  selectedNodeIdsRef.current = selectedNodeIds

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
