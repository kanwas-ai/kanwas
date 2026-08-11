import type { CanvasItem, SectionDef, SectionRelativePlacement } from 'shared'
import {
  AUDIO_NODE_LAYOUT,
  CANVAS_NODE_LAYOUT,
  FILE_NODE_LAYOUT,
  IMAGE_NODE_LAYOUT,
  LINK_NODE_LAYOUT,
  NODE_LAYOUT,
  STICKY_NOTE_NODE_LAYOUT,
  TEXT_NODE_LAYOUT,
} from 'shared/constants'
import { logMeasurement, shouldLogMeasurement } from '@/lib/measurementDebug'

const EMPTY_SECTION_WIDTH = 280
const EMPTY_SECTION_HEIGHT = 120
const SECTION_PADDING_X = 0
const SECTION_PADDING_TOP = 0

// Keep in sync with the section title typography in SectionBackgroundNode.
export const SECTION_TITLE_HEIGHT = 92
export const SECTION_TITLE_FONT_SIZE = 88
export const SECTION_TITLE_FONT_FAMILY = 'Inter, sans-serif'
export const SECTION_TITLE_FONT_WEIGHT = 700
export const SECTION_CONTENT_GAP = 14
const SECTION_GAP_X = 20
const SECTION_GAP_Y = 16
const DEFAULT_GRID_COLUMNS = 2
export const SECTION_CLUSTER_GAP_X = 400
export const SECTION_CLUSTER_GAP_Y = 400
export const SECTION_DROP_ZONE_SCALE = 0.05
const SECTION_TITLE_CONTROL_GAP = 8
const SECTION_TITLE_CONTROL_WIDTH = 32
const CANVAS_SECTION_TOP_OFFSET = 28
const CANVAS_SECTION_BOTTOM_TRIM = 18
const sectionLayoutDebugSignatures = new Map<string, string>()

export interface SectionBounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface SectionNodeMetrics {
  width: number
  height: number
  topOffset: number
  bottomTrim: number
}

type SectionMemberItem = CanvasItem | CanvasItem['items'][number]

export interface SectionLayoutSnapshot {
  width: number
  height: number
  memberPositions: Map<string, { x: number; y: number }>
}

export interface SectionPositionUpdate {
  id: string
  position: { x: number; y: number }
}

function findSectionMemberItem(canvas: CanvasItem, itemId: string): SectionMemberItem | null {
  return canvas.items.find((candidate): candidate is SectionMemberItem => candidate.id === itemId) ?? null
}

function getDefaultSectionNodeSize(item: SectionMemberItem): { width: number; height: number } {
  if (item.kind === 'canvas') {
    return { width: CANVAS_NODE_LAYOUT.WIDTH, height: CANVAS_NODE_LAYOUT.HEIGHT }
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
    case 'blockNote':
    default:
      return NODE_LAYOUT.DEFAULT_MEASURED
  }
}

export function getSectionNodeSize(item: SectionMemberItem): { width: number; height: number } | null {
  const fallbackSize = getDefaultSectionNodeSize(item)
  const measuredWidth =
    item.xynode.measured?.width ?? item.xynode.width ?? item.xynode.initialWidth ?? fallbackSize.width
  const measuredHeight =
    item.xynode.measured?.height ?? item.xynode.height ?? item.xynode.initialHeight ?? fallbackSize.height

  if (shouldLogMeasurement(item.id)) {
    const signature = [
      item.xynode.measured?.width ?? 'u',
      item.xynode.measured?.height ?? 'u',
      item.xynode.width ?? 'u',
      item.xynode.height ?? 'u',
      item.xynode.initialWidth ?? 'u',
      item.xynode.initialHeight ?? 'u',
      measuredWidth,
      measuredHeight,
    ].join(':')

    if (sectionLayoutDebugSignatures.get(item.id) !== signature) {
      sectionLayoutDebugSignatures.set(item.id, signature)
      logMeasurement('section-layout-size', item.id, {
        measured: item.xynode.measured ? { ...item.xynode.measured } : null,
        width: item.xynode.width,
        height: item.xynode.height,
        initialWidth: item.xynode.initialWidth,
        initialHeight: item.xynode.initialHeight,
        resolvedWidth: measuredWidth,
        resolvedHeight: measuredHeight,
      })
    }
  }

  if (
    typeof measuredWidth === 'number' &&
    measuredWidth > 0 &&
    typeof measuredHeight === 'number' &&
    measuredHeight > 0
  ) {
    return { width: measuredWidth, height: measuredHeight }
  }

  return null
}

function getSectionNodeMetrics(item: SectionMemberItem): SectionNodeMetrics | null {
  const size = getSectionNodeSize(item)
  if (!size) {
    return null
  }

  if (item.kind === 'canvas') {
    return { ...size, topOffset: CANVAS_SECTION_TOP_OFFSET, bottomTrim: CANVAS_SECTION_BOTTOM_TRIM }
  }

  switch (item.xynode.type) {
    case 'blockNote':
    case 'audio':
    case 'link':
      return { ...size, topOffset: 0, bottomTrim: 18 }
    case 'stickyNote':
      return { ...size, topOffset: 32, bottomTrim: 0 }
    default:
      return { ...size, topOffset: 0, bottomTrim: 0 }
  }
}

function buildHorizontalLayout(section: SectionDef, members: SectionMemberItem[]): SectionLayoutSnapshot {
  let cursorX = section.position.x + SECTION_PADDING_X
  let maxHeight = 0
  const memberPositions = new Map<string, { x: number; y: number }>()

  for (const member of members) {
    const metrics = getSectionNodeMetrics(member)
    if (!metrics) {
      continue
    }

    memberPositions.set(member.id, {
      x: cursorX,
      y: section.position.y + SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + SECTION_PADDING_TOP + metrics.topOffset,
    })
    cursorX += metrics.width + SECTION_GAP_X
    maxHeight = Math.max(maxHeight, metrics.topOffset + metrics.height - metrics.bottomTrim)
  }

  const contentWidth = cursorX - section.position.x - SECTION_GAP_X + SECTION_PADDING_X

  return {
    width: getSectionWidth(section.title, contentWidth),
    height: SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + SECTION_PADDING_TOP + maxHeight,
    memberPositions,
  }
}

function buildMasonryLayout(section: SectionDef, members: SectionMemberItem[]): SectionLayoutSnapshot {
  const columns = Math.max(1, Math.min(section.columns ?? DEFAULT_GRID_COLUMNS, members.length))
  const contentTop = section.position.y + SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + SECTION_PADDING_TOP
  const columnLayouts = Array.from({ length: columns }, () => ({
    width: 0,
    height: contentTop,
    items: [] as Array<{ id: string; y: number }>,
  }))

  for (const member of members) {
    const metrics = getSectionNodeMetrics(member)
    if (!metrics) {
      continue
    }

    let targetColumn = 0
    for (let column = 1; column < columnLayouts.length; column += 1) {
      if (columnLayouts[column].height < columnLayouts[targetColumn].height) {
        targetColumn = column
      }
    }

    const columnLayout = columnLayouts[targetColumn]
    const positionY = columnLayout.height + metrics.topOffset
    columnLayout.items.push({ id: member.id, y: positionY })
    columnLayout.width = Math.max(columnLayout.width, metrics.width)
    columnLayout.height = positionY + metrics.height - metrics.bottomTrim + SECTION_GAP_Y
  }

  let cursorX = section.position.x + SECTION_PADDING_X
  const memberPositions = new Map<string, { x: number; y: number }>()

  for (const columnLayout of columnLayouts) {
    for (const item of columnLayout.items) {
      memberPositions.set(item.id, { x: cursorX, y: item.y })
    }

    cursorX += columnLayout.width + SECTION_GAP_X
  }

  const width = Math.max(
    columnLayouts.reduce((total, columnLayout) => total + columnLayout.width, 0) +
      Math.max(0, columnLayouts.length - 1) * SECTION_GAP_X
  )
  const contentBottom = Math.max(
    ...columnLayouts.map((columnLayout) => Math.max(contentTop, columnLayout.height - SECTION_GAP_Y))
  )

  return {
    width: getSectionWidth(section.title, width),
    height: Math.max(
      SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + EMPTY_SECTION_HEIGHT,
      contentBottom - section.position.y
    ),
    memberPositions,
  }
}

export function buildSectionLayouts(canvas: CanvasItem): Map<string, SectionLayoutSnapshot> {
  const layouts = new Map<string, SectionLayoutSnapshot>()

  for (const section of canvas.sections ?? []) {
    const members = section.memberIds
      .map((memberId) => findSectionMemberItem(canvas, memberId))
      .filter((item): item is SectionMemberItem => Boolean(item))
    if (members.length === 0) {
      layouts.set(section.id, {
        width: getSectionWidth(section.title, 0),
        height: SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + EMPTY_SECTION_HEIGHT,
        memberPositions: new Map(),
      })
      continue
    }

    if (section.layout === 'horizontal') {
      layouts.set(section.id, buildHorizontalLayout(section, members))
      continue
    }

    layouts.set(section.id, buildMasonryLayout(section, members))
  }

  return layouts
}

export function isInsideSectionBounds(
  section: SectionDef,
  layout: SectionLayoutSnapshot | undefined,
  x: number,
  y: number
): boolean {
  const bounds = getSectionBounds(section, layout)
  if (!bounds) {
    return false
  }

  return x >= bounds.left && y >= bounds.top && x <= bounds.right && y <= bounds.bottom
}

export function getSectionBounds(section: SectionDef, layout: SectionLayoutSnapshot | undefined): SectionBounds | null {
  if (!layout) {
    return null
  }

  return {
    left: section.position.x,
    top: section.position.y,
    right: section.position.x + layout.width,
    bottom: section.position.y + layout.height,
  }
}

export function getSectionDropZoneBounds(
  section: SectionDef,
  layout: SectionLayoutSnapshot | undefined
): SectionBounds | null {
  const bounds = getSectionBounds(section, layout)
  if (!bounds) {
    return null
  }

  const expandX = (bounds.right - bounds.left) * SECTION_DROP_ZONE_SCALE
  const expandY = (bounds.bottom - bounds.top) * SECTION_DROP_ZONE_SCALE

  return {
    left: bounds.left - expandX,
    top: bounds.top - expandY,
    right: bounds.right + expandX,
    bottom: bounds.bottom + expandY,
  }
}

export function doBoundsIntersect(left: SectionBounds, right: SectionBounds): boolean {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top
}

function doBoundsIntersectWithGap(
  left: SectionBounds,
  right: SectionBounds,
  gapX = SECTION_GAP_X,
  gapY = SECTION_GAP_Y
): boolean {
  return (
    left.left < right.right + gapX &&
    left.right + gapX > right.left &&
    left.top < right.bottom + gapY &&
    left.bottom + gapY > right.top
  )
}

export function resolveSectionCollisionPositions({
  canvas,
  changedSectionIds,
}: {
  canvas: CanvasItem
  changedSectionIds: Iterable<string>
}): SectionPositionUpdate[] {
  const sections = canvas.sections ?? []
  const changedIds = [...new Set(changedSectionIds)].filter((sectionId) =>
    sections.some((section) => section.id === sectionId)
  )
  if (sections.length < 2 || changedIds.length === 0) {
    return []
  }

  const workingSections = sections.map((section) => ({
    ...section,
    position: { ...section.position },
    memberIds: [...section.memberIds],
  }))
  const workingCanvas: CanvasItem = {
    ...canvas,
    sections: workingSections,
  }

  const queue = [...changedIds]
  const queuedIds = new Set(queue)
  const movedIds = new Set<string>()
  const maxPasses = Math.max(1, workingSections.length * workingSections.length)
  let passCount = 0

  while (queue.length > 0 && passCount < maxPasses) {
    passCount += 1
    const sourceId = queue.shift()!
    queuedIds.delete(sourceId)

    const layouts = buildSectionLayouts(workingCanvas)
    const sourceSection = workingSections.find((section) => section.id === sourceId)
    if (!sourceSection) {
      continue
    }

    const sourceBounds = getSectionBounds(sourceSection, layouts.get(sourceSection.id))
    if (!sourceBounds) {
      continue
    }

    const sourceKeepOutBounds = getSectionDropZoneBounds(sourceSection, layouts.get(sourceSection.id)) ?? sourceBounds

    for (const targetSection of workingSections) {
      if (targetSection.id === sourceSection.id) {
        continue
      }

      const targetBounds = getSectionBounds(targetSection, layouts.get(targetSection.id))
      if (!targetBounds || !doBoundsIntersectWithGap(sourceKeepOutBounds, targetBounds)) {
        continue
      }

      const pushRight = targetSection.position.x > sourceSection.position.x
      const pushDown = targetSection.position.y > sourceSection.position.y

      if (!pushRight && !pushDown) {
        continue
      }

      const nextX = sourceKeepOutBounds.right + SECTION_GAP_X
      const nextY = sourceKeepOutBounds.bottom + SECTION_GAP_Y
      const moveRightBy = nextX - targetSection.position.x
      const moveDownBy = nextY - targetSection.position.y
      const canMoveRight = pushRight && moveRightBy > 0
      const canMoveDown = pushDown && moveDownBy > 0

      let nextPosition: { x: number; y: number } | null = null

      if (canMoveRight && canMoveDown) {
        const sourceCenterX = (sourceBounds.left + sourceBounds.right) / 2
        const sourceCenterY = (sourceBounds.top + sourceBounds.bottom) / 2
        const targetCenterX = (targetBounds.left + targetBounds.right) / 2
        const targetCenterY = (targetBounds.top + targetBounds.bottom) / 2
        const relativeDeltaX = Math.abs(targetCenterX - sourceCenterX)
        const relativeDeltaY = Math.abs(targetCenterY - sourceCenterY)

        nextPosition =
          relativeDeltaY >= relativeDeltaX
            ? { x: targetSection.position.x, y: nextY }
            : { x: nextX, y: targetSection.position.y }
      } else if (canMoveRight) {
        nextPosition = { x: nextX, y: targetSection.position.y }
      } else if (canMoveDown) {
        nextPosition = { x: targetSection.position.x, y: nextY }
      }

      if (!nextPosition) {
        continue
      }

      targetSection.position = nextPosition
      movedIds.add(targetSection.id)
      if (!queuedIds.has(targetSection.id)) {
        queue.push(targetSection.id)
        queuedIds.add(targetSection.id)
      }
    }
  }

  return workingSections
    .filter((section) => movedIds.has(section.id))
    .map((section) => ({ id: section.id, position: section.position }))
}

function getSectionWidth(title: string, contentWidth: number): number {
  return Math.max(EMPTY_SECTION_WIDTH, contentWidth, getSectionTitleRowWidth(title))
}

function getSectionTitleRowWidth(title: string): number {
  return measureSectionTitleWidth(title) + SECTION_TITLE_CONTROL_GAP + SECTION_TITLE_CONTROL_WIDTH
}

function measureSectionTitleWidth(title: string): number {
  const documentRef = (
    globalThis as {
      document?: {
        createElement(tag: string): {
          getContext(type: string): null | { font: string; measureText(text: string): { width: number } }
        }
      }
    }
  ).document
  if (!documentRef) {
    return Math.max(1, title.length) * SECTION_TITLE_FONT_SIZE * 0.58
  }

  const canvas = documentRef.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return Math.max(1, title.length) * SECTION_TITLE_FONT_SIZE * 0.58
  }

  context.font = `${SECTION_TITLE_FONT_WEIGHT} ${SECTION_TITLE_FONT_SIZE}px ${SECTION_TITLE_FONT_FAMILY}`
  return context.measureText(title).width
}

export function resolvePendingSectionPosition({
  pendingPlacement,
  anchorSection,
  anchorLayout,
}: {
  pendingPlacement: SectionRelativePlacement
  anchorSection: SectionDef
  anchorLayout: SectionLayoutSnapshot
}): { x: number; y: number } {
  if (pendingPlacement.mode === 'after') {
    return {
      x: anchorSection.position.x + anchorLayout.width + (pendingPlacement.gap ?? SECTION_CLUSTER_GAP_X),
      y: anchorSection.position.y,
    }
  }

  return {
    x: anchorSection.position.x,
    y: anchorSection.position.y + anchorLayout.height + (pendingPlacement.gap ?? SECTION_CLUSTER_GAP_Y),
  }
}
