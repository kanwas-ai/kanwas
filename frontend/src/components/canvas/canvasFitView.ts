import type { CanvasItem, NodeItem } from 'shared'
import {
  AUDIO_NODE_LAYOUT,
  COLLAPSED_NODE_LAYOUT,
  FILE_NODE_LAYOUT,
  IMAGE_NODE_LAYOUT,
  LINK_NODE_LAYOUT,
  NODE_LAYOUT,
  STICKY_NOTE_NODE_LAYOUT,
  TEXT_NODE_LAYOUT,
} from 'shared/constants'
import { CANVAS } from './constants'

type CanvasTreeItem = CanvasItem | NodeItem

type RenderedCanvasNode = {
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
  style?: {
    width?: number | string
    height?: number | string
  }
}

export interface CanvasFitItemBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasFitVisibleArea {
  availableWidth: number
  availableHeight: number
  centerX: number
  centerY: number
}

function hasPositiveCanvasDimension(value: unknown): value is number {
  return typeof value === 'number' && value > 0
}

function getPositiveStyleDimension(value: number | string | undefined): number | undefined {
  if (hasPositiveCanvasDimension(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  if (!/^\d+(\.\d+)?(px)?$/.test(trimmedValue)) {
    return undefined
  }

  const parsedValue = Number.parseFloat(trimmedValue)
  return hasPositiveCanvasDimension(parsedValue) ? parsedValue : undefined
}

function getRenderedNodeSize(renderedNode?: RenderedCanvasNode | null): { width?: number; height?: number } {
  return {
    width:
      renderedNode?.measured?.width ?? renderedNode?.width ?? getPositiveStyleDimension(renderedNode?.style?.width),
    height:
      renderedNode?.measured?.height ?? renderedNode?.height ?? getPositiveStyleDimension(renderedNode?.style?.height),
  }
}

export function hasRenderedCanvasItemDimensions(renderedNode?: RenderedCanvasNode | null): boolean {
  const { width, height } = getRenderedNodeSize(renderedNode)

  return hasPositiveCanvasDimension(width) && hasPositiveCanvasDimension(height)
}

const CANVAS_CARD_FALLBACK = {
  // Matches the rendered folder card dimensions in CanvasNode.
  width: 268,
  height: 56,
} as const

function getCanvasItemFallbackSize(item: CanvasTreeItem): { width: number; height: number } {
  if (item.kind === 'canvas') {
    return CANVAS_CARD_FALLBACK
  }

  if (item.collapsed === true) {
    return {
      width: COLLAPSED_NODE_LAYOUT.WIDTH,
      height: COLLAPSED_NODE_LAYOUT.HEIGHT,
    }
  }

  switch (item.xynode.type) {
    case 'image':
      return IMAGE_NODE_LAYOUT.DEFAULT_MEASURED
    case 'file':
      return FILE_NODE_LAYOUT.DEFAULT_MEASURED
    case 'audio':
      return AUDIO_NODE_LAYOUT.DEFAULT_MEASURED
    case 'link':
      return LINK_NODE_LAYOUT.DEFAULT_MEASURED
    case 'text':
      return TEXT_NODE_LAYOUT.DEFAULT_MEASURED
    case 'stickyNote':
      return STICKY_NOTE_NODE_LAYOUT.DEFAULT_MEASURED
    default:
      return NODE_LAYOUT.DEFAULT_MEASURED
  }
}

function getTreeItemWidth(item: CanvasTreeItem): number | undefined {
  return 'width' in item.xynode && typeof item.xynode.width === 'number' ? item.xynode.width : undefined
}

function getTreeItemHeight(item: CanvasTreeItem): number | undefined {
  return 'height' in item.xynode && typeof item.xynode.height === 'number' ? item.xynode.height : undefined
}

export function resolveCanvasItemBounds(
  item: CanvasTreeItem,
  renderedNode?: RenderedCanvasNode | null
): CanvasFitItemBounds | null {
  const fallbackSize = getCanvasItemFallbackSize(item)
  const renderedSize = getRenderedNodeSize(renderedNode)
  const measuredWidth = renderedSize.width ?? item.xynode.measured?.width ?? getTreeItemWidth(item)
  const measuredHeight = renderedSize.height ?? item.xynode.measured?.height ?? getTreeItemHeight(item)
  const width = measuredWidth ?? item.xynode.initialWidth ?? fallbackSize.width
  const height = measuredHeight ?? item.xynode.initialHeight ?? fallbackSize.height
  const position = renderedNode?.position ?? item.xynode.position

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    x: position.x,
    y: position.y,
    width,
    height,
  }
}

export function collectCanvasItemBounds(
  items: CanvasTreeItem[],
  getRenderedNode: (itemId: string) => RenderedCanvasNode | null | undefined
): CanvasFitItemBounds[] {
  return items
    .map((item) => resolveCanvasItemBounds(item, getRenderedNode(item.id)))
    .filter((bounds): bounds is CanvasFitItemBounds => bounds !== null)
}

export function resolveRenderedNodeBounds(renderedNode?: RenderedCanvasNode | null): CanvasFitItemBounds | null {
  if (!renderedNode) {
    return null
  }

  const { width, height } = getRenderedNodeSize(renderedNode)
  if (!hasPositiveCanvasDimension(width) || !hasPositiveCanvasDimension(height)) {
    return null
  }

  return {
    x: renderedNode.position.x,
    y: renderedNode.position.y,
    width,
    height,
  }
}

export function collectRenderedNodeBounds(
  nodeIds: string[],
  getRenderedNode: (nodeId: string) => RenderedCanvasNode | null | undefined
): CanvasFitItemBounds[] {
  return nodeIds
    .map((nodeId) => resolveRenderedNodeBounds(getRenderedNode(nodeId)))
    .filter((bounds): bounds is CanvasFitItemBounds => bounds !== null)
}

export function calculateCanvasFitViewport(
  bounds: CanvasFitItemBounds[],
  visibleArea: CanvasFitVisibleArea,
  options?: {
    padding?: number
    minZoom?: number
    maxZoom?: number
  }
): { x: number; y: number; zoom: number } | null {
  if (bounds.length === 0) {
    return null
  }

  const padding = options?.padding ?? CANVAS.FIT_PADDING
  const minZoom = options?.minZoom ?? CANVAS.MIN_ZOOM
  const maxZoom = options?.maxZoom ?? CANVAS.MAX_ZOOM

  const minX = Math.min(...bounds.map((entry) => entry.x))
  const minY = Math.min(...bounds.map((entry) => entry.y))
  const maxX = Math.max(...bounds.map((entry) => entry.x + entry.width))
  const maxY = Math.max(...bounds.map((entry) => entry.y + entry.height))

  const contentWidth = Math.max(maxX - minX, 1)
  const contentHeight = Math.max(maxY - minY, 1)
  const paddedWidth = Math.max(visibleArea.availableWidth - padding * 2, 1)
  const paddedHeight = Math.max(visibleArea.availableHeight - padding * 2, 1)
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(paddedWidth / contentWidth, paddedHeight / contentHeight)))
  const contentCenterX = minX + contentWidth / 2
  const contentCenterY = minY + contentHeight / 2

  return {
    x: visibleArea.centerX - contentCenterX * zoom,
    y: visibleArea.centerY - contentCenterY * zoom,
    zoom,
  }
}
