import { useCallback } from 'react'
import type { EdgeChange, NodeChange } from '@xyflow/react'
import type { CanvasItem } from 'shared'
import { applyEdgeChangesToCanvas, applyNodeChangesToCanvas } from '@/utils/applyChanges'
import { logMeasurement } from '@/lib/measurementDebug'
import { findCanonicalKanwasNodeId } from '@/lib/workspaceUtils'
import { showToast } from '@/utils/toast'
import type { LayoutHeightBaselineMap } from './useCanvasLayout'
import { getCurrentNodeHeight } from './CanvasFlow.config'
import { findSectionForItem } from './section/sectionMembers'

interface UseCanvasChangeHandlersOptions {
  mutableCanvas: CanvasItem
  root: CanvasItem | null
  handleNodesChangeForLayout: (changes: NodeChange[], layoutBaselineHeights: LayoutHeightBaselineMap) => void
  queueDeleteConfirmation: (changes: NodeChange[]) => void
  onSectionContentChange?: (sectionId: string) => void
}

function getCanvasItem(canvas: CanvasItem, nodeId: string) {
  return canvas.items.find((candidate) => candidate.id === nodeId) ?? null
}

function isPositionChangeMeaningful(canvas: CanvasItem, change: NodeChange & { type: 'position' }): boolean {
  const item = getCanvasItem(canvas, change.id)
  if (!item) {
    return false
  }

  const positionChanged =
    Boolean(change.position) &&
    (item.xynode.position.x !== change.position?.x || item.xynode.position.y !== change.position?.y)
  const draggingChanged = typeof change.dragging === 'boolean' && item.xynode.dragging !== change.dragging

  return positionChanged || draggingChanged
}

function doesDimensionChangeSize(canvas: CanvasItem, change: NodeChange & { type: 'dimensions' }): boolean {
  const item = getCanvasItem(canvas, change.id)
  if (!item) {
    return false
  }

  const dimensions = change.dimensions
  const measuredChanged =
    Boolean(dimensions) &&
    (item.xynode.measured?.width !== dimensions?.width || item.xynode.measured?.height !== dimensions?.height)
  const widthAttributeChanged =
    Boolean(dimensions) &&
    (change.setAttributes === true || change.setAttributes === 'width') &&
    item.xynode.width !== dimensions?.width
  const heightAttributeChanged =
    Boolean(dimensions) &&
    (change.setAttributes === true || change.setAttributes === 'height') &&
    item.xynode.height !== dimensions?.height

  return measuredChanged || widthAttributeChanged || heightAttributeChanged
}

function isDimensionChangeMeaningful(canvas: CanvasItem, change: NodeChange & { type: 'dimensions' }): boolean {
  const item = getCanvasItem(canvas, change.id)
  if (!item) {
    return false
  }

  const resizingChanged = typeof change.resizing === 'boolean' && item.xynode.resizing !== change.resizing
  return doesDimensionChangeSize(canvas, change) || resizingChanged
}

function shouldApplyCanvasNodeChange(canvas: CanvasItem, change: NodeChange): boolean {
  switch (change.type) {
    case 'add':
    case 'select':
      return false
    case 'position':
      return isPositionChangeMeaningful(canvas, change)
    case 'dimensions':
      return isDimensionChangeMeaningful(canvas, change)
    default:
      return true
  }
}

export function useCanvasChangeHandlers({
  mutableCanvas,
  root,
  handleNodesChangeForLayout,
  queueDeleteConfirmation,
  onSectionContentChange,
}: UseCanvasChangeHandlersOptions) {
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const canonicalKanwasNodeId = root ? findCanonicalKanwasNodeId(root) : null
      const protectedNodeIds = new Set(canonicalKanwasNodeId ? [canonicalKanwasNodeId] : [])
      const blockedDeleteAttempt = changes.some((change) => change.type === 'remove' && protectedNodeIds.has(change.id))

      if (blockedDeleteAttempt) {
        showToast('Instructions document cannot be deleted', 'info')
      }

      const groupBgIds = new Set((mutableCanvas.groups ?? []).map((group) => group.id))
      const sectionBgIds = new Set((mutableCanvas.sections ?? []).map((section) => section.id))
      const removeChanges = changes.filter(
        (change) =>
          change.type === 'remove' &&
          !protectedNodeIds.has(change.id) &&
          !groupBgIds.has(change.id) &&
          !sectionBgIds.has(change.id)
      )
      const otherChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          return false
        }

        if (
          (change.type === 'position' || change.type === 'dimensions') &&
          (groupBgIds.has(change.id) || sectionBgIds.has(change.id))
        ) {
          return false
        }

        return true
      })

      const canvasNodeChanges = otherChanges.filter((change) => shouldApplyCanvasNodeChange(mutableCanvas, change))
      const layoutChanges = changes.filter((change) => {
        if (change.type !== 'dimensions') {
          return true
        }

        return isDimensionChangeMeaningful(mutableCanvas, change)
      })
      const dimensionSizeChangeIds = new Set(
        canvasNodeChanges
          .filter(
            (change): change is NodeChange & { type: 'dimensions' } =>
              change.type === 'dimensions' && doesDimensionChangeSize(mutableCanvas, change)
          )
          .map((change) => change.id)
      )

      for (const change of canvasNodeChanges) {
        if (change.type !== 'dimensions' || !change.dimensions) {
          continue
        }

        const item = mutableCanvas.items.find((candidate) => candidate.id === change.id)
        const section = item ? findSectionForItem(mutableCanvas, change.id) : null

        logMeasurement('onNodesChange-in', change.id, {
          dimensions: change.dimensions,
          resizing: change.resizing,
          setAttributes: change.setAttributes,
          measuredBefore: item?.xynode.measured ? { ...item.xynode.measured } : null,
          sectionId: section?.id ?? null,
        })
      }

      const layoutBaselineHeights: LayoutHeightBaselineMap = new Map()
      for (const change of layoutChanges) {
        if (change.type !== 'dimensions' || !change.dimensions || layoutBaselineHeights.has(change.id)) {
          continue
        }

        const item = mutableCanvas.items.find((candidate) => candidate.id === change.id)
        if (!item) {
          continue
        }

        const currentNodeHeight = getCurrentNodeHeight(item)
        if (currentNodeHeight != null) {
          layoutBaselineHeights.set(change.id, currentNodeHeight)
        }
      }

      if (canvasNodeChanges.length > 0) {
        applyNodeChangesToCanvas(canvasNodeChanges, mutableCanvas, protectedNodeIds)

        for (const change of canvasNodeChanges) {
          if (change.type !== 'dimensions' || !change.dimensions) {
            continue
          }

          const item = mutableCanvas.items.find((candidate) => candidate.id === change.id)

          logMeasurement('onNodesChange-out', change.id, {
            measuredAfter: item?.xynode.measured ? { ...item.xynode.measured } : null,
            widthAfter: item?.xynode.width,
            heightAfter: item?.xynode.height,
          })
        }
      }

      const sectionIdsWithMemberDimensionChanges = new Set<string>()
      for (const change of layoutChanges) {
        if (change.type !== 'dimensions' || !change.dimensions) {
          continue
        }

        if (!dimensionSizeChangeIds.has(change.id)) {
          continue
        }

        const section = findSectionForItem(mutableCanvas, change.id)
        if (section) {
          sectionIdsWithMemberDimensionChanges.add(section.id)
        }
      }

      handleNodesChangeForLayout(layoutChanges, layoutBaselineHeights)

      for (const sectionId of sectionIdsWithMemberDimensionChanges) {
        onSectionContentChange?.(sectionId)
      }

      queueDeleteConfirmation(removeChanges)
    },
    [mutableCanvas, onSectionContentChange, root, handleNodesChangeForLayout, queueDeleteConfirmation]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyEdgeChangesToCanvas(changes, mutableCanvas)
    },
    [mutableCanvas]
  )

  return {
    onNodesChange,
    onEdgesChange,
  }
}
