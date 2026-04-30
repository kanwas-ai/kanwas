import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CanvasItem, NodeItem } from 'shared'
import { useFitNodeInView } from './hooks'

type Direction = 'up' | 'down' | 'left' | 'right'

export const useNavigateNodes = (
  canvas: CanvasItem,
  selectedNodeIds: string[],
  setSelectedNodeIds: (nodeIds: string[]) => void
) => {
  const reactFlowInstance = useReactFlow()
  const fitNodeInView = useFitNodeInView()

  const selectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds([nodeId])
    },
    [setSelectedNodeIds]
  )

  const navigateNodes = useCallback(
    (direction: Direction) => {
      const nodeItems = canvas.items.filter((i): i is NodeItem => i.kind === 'node')
      const nodeList = nodeItems.map((nodeItem) => nodeItem.xynode)

      // If no node is selected, select the one nearest to the center of the viewport
      if (selectedNodeIds.length === 0) {
        if (nodeList.length === 0) return

        const viewport = reactFlowInstance.getViewport()
        const centerX = -viewport.x / viewport.zoom + window.innerWidth / 2 / viewport.zoom
        const centerY = -viewport.y / viewport.zoom + window.innerHeight / 2 / viewport.zoom

        let nearestNode = null
        let minDistance = Infinity

        for (const node of nodeList) {
          const dx = node.position.x - centerX
          const dy = node.position.y - centerY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < minDistance) {
            minDistance = distance
            nearestNode = node
          }
        }

        if (nearestNode) {
          selectNode(nearestNode.id)
          fitNodeInView(nearestNode.id)
        }
        return
      }

      if (selectedNodeIds.length !== 1) return

      const currentSelectedId = selectedNodeIds[0]
      const selectedNode = nodeList.find((n) => n.id === currentSelectedId)
      if (!selectedNode) return

      const otherNodes = nodeList.filter((n) => n.id !== currentSelectedId)
      let nearestNode = null
      let minDistance = Infinity

      for (const node of otherNodes) {
        const dx = node.position.x - selectedNode.position.x
        const dy = node.position.y - selectedNode.position.y

        let isInDirection = false
        let distance = 0

        switch (direction) {
          case 'right':
            isInDirection = dx > 0
            distance = Math.abs(dx) + Math.abs(dy) * 0.5
            break
          case 'left':
            isInDirection = dx < 0
            distance = Math.abs(dx) + Math.abs(dy) * 0.5
            break
          case 'down':
            isInDirection = dy > 0
            distance = Math.abs(dy) + Math.abs(dx) * 0.5
            break
          case 'up':
            isInDirection = dy < 0
            distance = Math.abs(dy) + Math.abs(dx) * 0.5
            break
        }

        if (isInDirection && distance < minDistance) {
          minDistance = distance
          nearestNode = node
        }
      }

      if (nearestNode) {
        selectNode(nearestNode.id)
        fitNodeInView(nearestNode.id)
      }
    },
    [selectedNodeIds, canvas.items, fitNodeInView, reactFlowInstance, selectNode]
  )

  return {
    navigateNodes,
  }
}
