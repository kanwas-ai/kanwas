import type { NodeChange, EdgeChange } from '@xyflow/react'
import type { CanvasItem } from 'shared'
import { logMeasurement, traceMeasurement } from '@/lib/measurementDebug'

export function applyNodeChangesToCanvas(
  changes: NodeChange[],
  canvas: CanvasItem,
  protectedNodeIds: Set<string> = new Set()
): void {
  // Batch all removals into a single operation to avoid conflicts with Valtio/Yjs when calling splice multiple times
  const removeChanges = changes.filter(
    (c): c is NodeChange & { type: 'remove' } => c.type === 'remove' && !protectedNodeIds.has(c.id)
  )
  if (removeChanges.length > 0) {
    const idsToRemove = new Set(removeChanges.map((c) => c.id))

    // Single operation - filter out all items to remove at once
    canvas.items = canvas.items.filter((item) => !idsToRemove.has(item.id))
  }

  // Process other change types (skip 'add' changes which don't have id)
  for (const change of changes) {
    if (change.type === 'add') continue

    // Find item (could be NodeItem or CanvasItem)
    const item = canvas.items.find((i) => i.id === change.id)
    if (!item) continue

    switch (change.type) {
      case 'remove':
        // Already handled above in batch
        break
      case 'position': {
        if (change.position) {
          item.xynode.position = change.position
        }
        if (typeof change.dragging !== 'undefined') {
          item.xynode.dragging = change.dragging
        }
        break
      }
      case 'select': {
        // Selection is viewer-local state and must not be written to the shared canvas model.
        break
      }
      case 'dimensions': {
        const previousMeasured = item.xynode.measured ? { ...item.xynode.measured } : null

        if (change.dimensions) {
          logMeasurement('applyChanges-dimensions-in', change.id, {
            previousMeasured,
            nextDimensions: change.dimensions,
            resizing: change.resizing,
            setAttributes: change.setAttributes,
          })

          if (typeof previousMeasured?.height === 'number' && change.dimensions.height < previousMeasured.height) {
            traceMeasurement('applyChanges-dimensions-shrink', change.id, {
              previousMeasured,
              nextDimensions: change.dimensions,
              resizing: change.resizing,
              setAttributes: change.setAttributes,
            })
          }

          item.xynode.measured ??= { width: 0, height: 0 }
          item.xynode.measured.width = change.dimensions.width
          item.xynode.measured.height = change.dimensions.height

          if (change.setAttributes) {
            if (change.setAttributes === true || change.setAttributes === 'width') {
              item.xynode.width = change.dimensions.width
            }
            if (change.setAttributes === true || change.setAttributes === 'height') {
              item.xynode.height = change.dimensions.height
            }
          }
        }
        if (typeof change.resizing === 'boolean') {
          item.xynode.resizing = change.resizing
        }

        if (change.dimensions) {
          logMeasurement('applyChanges-dimensions-out', change.id, {
            measured: item.xynode.measured ? { ...item.xynode.measured } : null,
            width: item.xynode.width,
            height: item.xynode.height,
            resizing: item.xynode.resizing,
          })
        }

        break
      }
    }
  }
}

export function applyEdgeChangesToCanvas(changes: EdgeChange[], canvas: CanvasItem): void {
  for (const change of changes) {
    switch (change.type) {
      case 'remove': {
        const index = canvas.edges.findIndex((e) => e.id === change.id)
        if (index !== -1) {
          canvas.edges.splice(index, 1)
        }
        break
      }
      case 'select': {
        // Selection is viewer-local state and must not be written to the shared canvas model.
        break
      }
    }
  }
}
