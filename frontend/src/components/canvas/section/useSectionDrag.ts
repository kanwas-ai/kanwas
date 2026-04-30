import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Node as XYNode, OnNodeDrag } from '@xyflow/react'
import type { CanvasItem, SectionDef } from 'shared'
import { moveItemToSection, removeItemFromSection } from './sectionUtils'
import { findSectionForItem, findSectionMemberItem } from './sectionMembers'
import {
  buildSectionLayouts,
  doBoundsIntersect,
  getSectionDropZoneBounds,
  getSectionNodeSize,
  isInsideSectionBounds,
} from './layout'

interface UseSectionDragOptions {
  mutableCanvas: CanvasItem
  groupedIdsRef: RefObject<Set<string>>
  draggingNodeIdsRef: RefObject<Set<string>>
  onSectionContentChange?: (sectionId: string) => void
  onNodeDragStart: OnNodeDrag<XYNode>
  onNodeDrag: OnNodeDrag<XYNode>
  onNodeDragStop: OnNodeDrag<XYNode>
}

export function useSectionDrag({
  mutableCanvas,
  groupedIdsRef,
  draggingNodeIdsRef,
  onSectionContentChange,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
}: UseSectionDragOptions) {
  const memberDragSectionId = useRef<string | null>(null)
  const [joinTargetSectionId, setJoinTargetSectionId] = useState<string | null>(null)

  const onNodeDragStartWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      setJoinTargetSectionId(null)

      if (groupedIdsRef.current.has(node.id)) {
        memberDragSectionId.current = null
        onNodeDragStart(event, node, nodes)
        return
      }

      const section = findSectionForNode(mutableCanvas, node.id)
      if (section && nodes.length === 1) {
        draggingNodeIdsRef.current = new Set(nodes.map((candidate) => candidate.id))
        memberDragSectionId.current = section.id
        return
      }

      memberDragSectionId.current = null
      onNodeDragStart(event, node, nodes)
    },
    [draggingNodeIdsRef, groupedIdsRef, mutableCanvas, onNodeDragStart]
  )

  const onNodeDragWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      const sourceSectionId = memberDragSectionId.current
      if (sourceSectionId) {
        const section = mutableCanvas.sections?.find((candidate) => candidate.id === sourceSectionId)
        if (!section) {
          memberDragSectionId.current = null
          setJoinTargetSectionId(null)
          onNodeDrag(event, node, nodes)
          return
        }

        if (isNodeInsideSection(node, section, mutableCanvas)) {
          setJoinTargetSectionId(section.id)
          reorderSectionMember(mutableCanvas, section, node.id, getDraggedNodeSize(mutableCanvas, node), node.position)
        } else {
          const dropTargetSection = findDropTargetSection(mutableCanvas, node)
          setJoinTargetSectionId(dropTargetSection?.id ?? null)
        }
        return
      }

      const dropTargetSection = findJoinTargetSection(mutableCanvas, nodes, groupedIdsRef.current)
      setJoinTargetSectionId(dropTargetSection?.id ?? null)

      onNodeDrag(event, node, nodes)
    },
    [groupedIdsRef, mutableCanvas, onNodeDrag]
  )

  const onNodeDragStopWrapped = useCallback<OnNodeDrag<XYNode>>(
    (event, node, nodes) => {
      draggingNodeIdsRef.current = new Set()
      setJoinTargetSectionId(null)

      const dropTargetSection = findDropTargetSection(mutableCanvas, node)
      if (dropTargetSection) {
        const sortedNodes = [...nodes].sort((left, right) => {
          if (left.position.y !== right.position.y) {
            return left.position.y - right.position.y
          }

          return left.position.x - right.position.x
        })

        let insertIndex = computeSectionInsertIndex(
          mutableCanvas,
          dropTargetSection,
          node.id,
          getDraggedNodeSize(mutableCanvas, node),
          node.position
        )
        let movedCount = 0
        for (const draggedNode of sortedNodes) {
          if (groupedIdsRef.current.has(draggedNode.id)) {
            continue
          }

          const item = findNodeItem(mutableCanvas, draggedNode.id)
          if (!item) {
            continue
          }

          moveItemToSection(mutableCanvas, item, dropTargetSection, insertIndex)
          onSectionContentChange?.(dropTargetSection.id)
          insertIndex += 1
          movedCount += 1
        }

        memberDragSectionId.current = null
        if (movedCount > 0) {
          return
        }
      }

      let removedFromSection = false
      for (const draggedNode of nodes) {
        if (groupedIdsRef.current.has(draggedNode.id)) {
          continue
        }

        const section = findSectionForNode(mutableCanvas, draggedNode.id)
        if (!section || isNodeInsideSection(draggedNode, section, mutableCanvas)) {
          continue
        }

        const item = findNodeItem(mutableCanvas, draggedNode.id)
        if (!item) {
          continue
        }

        removeItemFromSection(mutableCanvas, item)
        item.xynode.position = draggedNode.position
        removedFromSection = true
      }

      memberDragSectionId.current = null
      if (removedFromSection) {
        return
      }

      onNodeDragStop(event, node, nodes)
    },
    [draggingNodeIdsRef, groupedIdsRef, mutableCanvas, onNodeDragStop, onSectionContentChange]
  )

  return {
    joinTargetSectionId,
    onNodeDragStart: onNodeDragStartWrapped,
    onNodeDrag: onNodeDragWrapped,
    onNodeDragStop: onNodeDragStopWrapped,
  }
}

function findJoinTargetSection(canvas: CanvasItem, nodes: XYNode[], groupedIds: Set<string>): SectionDef | null {
  for (const draggedNode of nodes) {
    if (groupedIds.has(draggedNode.id)) {
      continue
    }

    const section = findDropTargetSection(canvas, draggedNode)
    if (section) {
      return section
    }
  }

  return null
}

function findNodeItem(canvas: CanvasItem, nodeId: string) {
  return findSectionMemberItem(canvas, nodeId)
}

function findSectionForNode(canvas: CanvasItem, nodeId: string): SectionDef | null {
  return findSectionForItem(canvas, nodeId)
}

function isNodeInsideSection(node: XYNode, section: SectionDef, canvas: CanvasItem): boolean {
  const item = findNodeItem(canvas, node.id)
  const fallbackSize = item ? (getSectionNodeSize(item) ?? { width: 0, height: 0 }) : { width: 0, height: 0 }
  const width = node.measured?.width ?? node.width ?? fallbackSize.width
  const height = node.measured?.height ?? node.height ?? fallbackSize.height
  return isInsideSectionBounds(
    section,
    buildSectionLayouts(canvas).get(section.id),
    node.position.x + width / 2,
    node.position.y + height / 2
  )
}

function findDropTargetSection(canvas: CanvasItem, node: XYNode): SectionDef | null {
  const nodeBounds = getNodeBounds(canvas, node)
  const sectionLayouts = buildSectionLayouts(canvas)

  for (const section of canvas.sections ?? []) {
    const sectionBounds = getSectionDropZoneBounds(section, sectionLayouts.get(section.id))
    if (sectionBounds && doBoundsIntersect(nodeBounds, sectionBounds)) {
      return section
    }
  }

  return null
}

function getNodeBounds(canvas: CanvasItem, node: XYNode) {
  const item = findNodeItem(canvas, node.id)
  const fallbackSize = item ? (getSectionNodeSize(item) ?? { width: 0, height: 0 }) : { width: 0, height: 0 }
  const width = node.measured?.width ?? node.width ?? fallbackSize.width
  const height = node.measured?.height ?? node.height ?? fallbackSize.height

  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
  }
}

function computeSectionInsertIndex(
  canvas: CanvasItem,
  section: SectionDef,
  draggedNodeId: string,
  draggedNodeSize: { width: number; height: number },
  position: { x: number; y: number }
): number {
  const otherMembers = section.memberIds.filter((memberId) => memberId !== draggedNodeId)
  const sections = canvas.sections ?? []
  let bestIndex = otherMembers.length
  let bestDistance = Number.POSITIVE_INFINITY

  for (let candidateIndex = 0; candidateIndex <= otherMembers.length; candidateIndex += 1) {
    const memberIds = [...otherMembers]
    memberIds.splice(candidateIndex, 0, draggedNodeId)

    const simulatedCanvas: CanvasItem = {
      ...canvas,
      sections: sections.map((candidate) =>
        candidate.id === section.id
          ? {
              ...candidate,
              memberIds,
            }
          : candidate
      ),
    }
    const slotPosition = buildSectionLayouts(simulatedCanvas).get(section.id)?.memberPositions.get(draggedNodeId)
    if (!slotPosition) {
      continue
    }

    const slotCenterX = slotPosition.x + draggedNodeSize.width / 2
    const slotCenterY = slotPosition.y + draggedNodeSize.height / 2
    const draggedCenterX = position.x + draggedNodeSize.width / 2
    const draggedCenterY = position.y + draggedNodeSize.height / 2
    const distance = Math.hypot(slotCenterX - draggedCenterX, slotCenterY - draggedCenterY)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = candidateIndex
    }
  }

  return bestIndex
}

function reorderSectionMember(
  canvas: CanvasItem,
  section: SectionDef,
  draggedNodeId: string,
  draggedNodeSize: { width: number; height: number },
  position: { x: number; y: number }
) {
  const currentIndex = section.memberIds.indexOf(draggedNodeId)
  if (currentIndex === -1) {
    return
  }

  const targetIndex = computeSectionInsertIndex(canvas, section, draggedNodeId, draggedNodeSize, position)
  if (targetIndex === currentIndex) {
    return
  }

  const nextMemberIds = section.memberIds.filter((memberId) => memberId !== draggedNodeId)
  const nextIndex = Math.max(0, Math.min(targetIndex, nextMemberIds.length))
  nextMemberIds.splice(nextIndex, 0, draggedNodeId)
  section.memberIds = nextMemberIds
}

function getDraggedNodeSize(canvas: CanvasItem, node: XYNode): { width: number; height: number } {
  const item = findNodeItem(canvas, node.id)
  const fallbackSize = item ? (getSectionNodeSize(item) ?? { width: 0, height: 0 }) : { width: 0, height: 0 }

  return {
    width: node.measured?.width ?? node.width ?? fallbackSize.width,
    height: node.measured?.height ?? node.height ?? fallbackSize.height,
  }
}
