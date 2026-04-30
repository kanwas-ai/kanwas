import { useMemo, useRef } from 'react'
import type { CanvasItem, GroupDef, SectionDef } from 'shared'
import { COLLAPSIBLE_TYPES } from './group'
import { defaultCollapsedNodeEmoji, LINK_NODE_DRAG_HANDLE } from './CanvasFlow.config'
import { buildSectionLayouts } from './section'
import { findSectionForItem } from './section/sectionMembers'

interface UseCanvasNodeProjectionOptions {
  canvas: CanvasItem
  groupedIds: Set<string>
  groupGrids: Map<string, { width: number; height: number; cellPositions: { x: number; y: number }[] }>
  draggingNodeIdsRef: React.RefObject<Set<string>>
  joinTargetGroupId: string | null
  joinTargetSectionId: string | null
  toolbarHoverSectionId: string | null
  onCanvasSelect?: (canvasId: string) => void
  onFocusNode: (nodeId: string) => void
  onSelectNode: (nodeId: string) => void
  onDeselectNode: (nodeId: string) => void
  onWorkspaceLinkNavigate?: (href: string) => boolean
  onExpandNode: (nodeId: string) => void
  onCollapseNode: (nodeId: string) => void
  handleGroupColorChange: (groupId: string, color: string) => void
  handleGroupColumnsChange: (groupId: string, columns: number) => void
  handleGroupDrag: (groupId: string, dx: number, dy: number) => void
  handleGroupNameChange: (groupId: string, name: string) => void
  handleSectionTitleChange: (sectionId: string, title: string) => void
  handleSectionLayoutChange: (sectionId: string, layout: 'horizontal' | 'grid') => void
  handleSectionColumnsChange: (sectionId: string, columns: number | undefined) => void
  handleSectionDrag: (sectionId: string, dx: number, dy: number) => void
  handleSectionDragStart: (sectionId: string) => void
  handleSectionDragEnd: (sectionId: string) => void
  handleDeleteSection: (sectionId: string) => void
  canonicalKanwasNodeId: string | null
  selectedNodeIds: string[]
}

type ProjectedCanvasNode = { id: string; [key: string]: unknown }

type ProjectionCacheEntry = {
  node: ProjectedCanvasNode
  snapshot?: unknown
  groupKey?: string
  sectionKey?: string
  sectionPositionKey?: string
  positionKey?: string
  layoutKey?: string
  selected?: boolean
  collapsed?: boolean
  dropTarget?: boolean
  joinTarget?: boolean
  deps?: readonly unknown[]
}

function areDepsEqual(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  if (!left || left.length !== right.length) {
    return false
  }

  return left.every((dependency, index) => dependency === right[index])
}

function getPositionKey(position: { x: number; y: number } | undefined): string {
  return position ? `${position.x}:${position.y}` : 'unknown'
}

function getLayoutKey(width: number | undefined, height: number | undefined): string {
  return `${width ?? 'u'}:${height ?? 'u'}`
}

function getGroupKey(group: GroupDef): string {
  return [
    group.id,
    group.name,
    group.color ?? '',
    getPositionKey(group.position),
    (group.memberIds ?? []).join('\u0000'),
    group.columns ?? '',
  ].join('\u0001')
}

function getSectionKey(section: SectionDef): string {
  return [
    section.id,
    section.title,
    section.layout,
    getPositionKey(section.position),
    section.memberIds.join('\u0000'),
    section.columns ?? '',
  ].join('\u0001')
}

export function useCanvasNodeProjection({
  canvas,
  groupedIds,
  groupGrids,
  draggingNodeIdsRef,
  joinTargetGroupId,
  joinTargetSectionId,
  toolbarHoverSectionId,
  onCanvasSelect,
  onFocusNode,
  onSelectNode,
  onDeselectNode,
  onWorkspaceLinkNavigate,
  onExpandNode,
  onCollapseNode,
  handleGroupColorChange,
  handleGroupColumnsChange,
  handleGroupDrag,
  handleGroupNameChange,
  handleSectionTitleChange,
  handleSectionLayoutChange,
  handleSectionColumnsChange,
  handleSectionDrag,
  handleSectionDragStart,
  handleSectionDragEnd,
  handleDeleteSection,
  canonicalKanwasNodeId,
  selectedNodeIds,
}: UseCanvasNodeProjectionOptions): ProjectedCanvasNode[] {
  const nodesCacheRef = useRef(new Map<string, ProjectionCacheEntry>())

  return useMemo(() => {
    const snapshotNodeToGroup = new Map<string, GroupDef>()
    const selectedNodeIdSet = new Set(selectedNodeIds)
    const sectionLayouts = buildSectionLayouts(canvas)
    for (const group of canvas.groups ?? []) {
      for (const memberId of group.memberIds ?? []) {
        snapshotNodeToGroup.set(memberId, group)
      }
    }

    const newCache = new Map<string, ProjectionCacheEntry>()
    const result: ProjectedCanvasNode[] = canvas.items.map((item) => {
      const isInGroup = groupedIds.has(item.id)
      const nodeItem = item.kind === 'node' ? item : null
      const cacheKey = `item:${item.id}`
      const cached = nodesCacheRef.current.get(cacheKey)
      const group = isInGroup ? snapshotNodeToGroup.get(item.id) : undefined
      const section = findSectionForItem(canvas, item.id) ?? undefined
      const sectionKey = section ? getSectionKey(section) : undefined
      const groupKey = group ? getGroupKey(group) : undefined
      const sectionLayout = section ? sectionLayouts.get(section.id) : undefined
      const sectionPosition = sectionLayout?.memberPositions.get(item.id)
      const sectionPositionKey = sectionPosition ? `${sectionPosition.x}:${sectionPosition.y}` : undefined

      const canCollapse = nodeItem && COLLAPSIBLE_TYPES.has(nodeItem.xynode.type)
      const isCollapsed = isInGroup || (canCollapse ? nodeItem.collapsed === true : false)

      let position = item.xynode.position
      if (section && !draggingNodeIdsRef.current.has(item.id)) {
        if (sectionPosition) {
          position = sectionPosition
        }
      }
      if (isInGroup && !draggingNodeIdsRef.current.has(item.id)) {
        const itemGroup = snapshotNodeToGroup.get(item.id)
        if (itemGroup) {
          const grid = groupGrids.get(itemGroup.id)
          const memberIndex = (itemGroup.memberIds ?? []).indexOf(item.id)
          if (grid && memberIndex >= 0) {
            const cellPosition = grid.cellPositions[memberIndex]
            position = {
              x: itemGroup.position.x + cellPosition.x,
              y: itemGroup.position.y + cellPosition.y,
            }
          }
        }
      }

      const selected = selectedNodeIdSet.has(item.id)
      const positionKey = getPositionKey(position)
      const itemDeps = [
        canonicalKanwasNodeId,
        onCanvasSelect,
        onFocusNode,
        onSelectNode,
        onDeselectNode,
        onWorkspaceLinkNavigate,
        onExpandNode,
        onCollapseNode,
      ]

      if (
        cached &&
        cached.snapshot === item &&
        cached.groupKey === groupKey &&
        cached.sectionKey === sectionKey &&
        cached.sectionPositionKey === sectionPositionKey &&
        cached.positionKey === positionKey &&
        cached.selected === selected &&
        cached.collapsed === isCollapsed &&
        areDepsEqual(cached.deps, itemDeps)
      ) {
        newCache.set(cacheKey, cached)
        return cached.node
      }

      const node: ProjectedCanvasNode = {
        ...item.xynode,
        position,
        selected,
        ...(item.xynode.type === 'link' && { dragHandle: LINK_NODE_DRAG_HANDLE }),
        ...(isCollapsed && { type: 'collapsedCard' as const }),
        data: {
          ...item.xynode.data,
          documentName: item.name,
          isKanwasProtected:
            item.kind === 'node' && canonicalKanwasNodeId !== null && item.id === canonicalKanwasNodeId,
          onCanvasSelect,
          onFocusNode,
          onSelectNode,
          onDeselectNode,
          onWorkspaceLinkNavigate,
          collapsed: isCollapsed,
          onExpandNode: isInGroup ? undefined : onExpandNode,
          onCollapseNode,
          inGroup: isInGroup,
          ...(isCollapsed && {
            emoji: nodeItem?.emoji || defaultCollapsedNodeEmoji(item.xynode.type),
            summary: nodeItem?.summary,
            originalType: item.xynode.type,
          }),
        },
      }

      newCache.set(cacheKey, {
        snapshot: item,
        groupKey,
        sectionKey,
        sectionPositionKey,
        positionKey,
        selected,
        collapsed: isCollapsed,
        deps: itemDeps,
        node,
      })

      return node
    })

    for (const group of canvas.groups ?? []) {
      const grid = groupGrids.get(group.id)
      if (!grid) {
        continue
      }

      const cacheKey = `group:${group.id}`
      const groupKey = getGroupKey(group)
      const layoutKey = getLayoutKey(grid.width, grid.height)
      const isJoinTarget = joinTargetGroupId === group.id
      const groupDeps = [handleGroupColorChange, handleGroupColumnsChange, handleGroupDrag, handleGroupNameChange]
      const cached = nodesCacheRef.current.get(cacheKey)
      const dimensions = { width: grid.width, height: grid.height }

      if (
        cached &&
        cached.groupKey === groupKey &&
        cached.layoutKey === layoutKey &&
        cached.joinTarget === isJoinTarget &&
        areDepsEqual(cached.deps, groupDeps)
      ) {
        newCache.set(cacheKey, cached)
        result.push(cached.node)
        continue
      }

      const node: ProjectedCanvasNode = {
        id: group.id,
        type: 'groupBackground' as const,
        position: group.position,
        width: dimensions.width,
        height: dimensions.height,
        measured: dimensions,
        zIndex: -1,
        data: {
          name: group.name,
          color: group.color,
          isJoinTarget,
          onColorChange: handleGroupColorChange,
          onColumnsChange: handleGroupColumnsChange,
          onGroupDrag: handleGroupDrag,
          onNameChange: handleGroupNameChange,
          memberCount: (group.memberIds ?? []).length,
          columns: group.columns,
        },
        style: dimensions,
        draggable: false,
        selectable: false,
        focusable: false,
      }

      newCache.set(cacheKey, {
        groupKey,
        layoutKey,
        joinTarget: isJoinTarget,
        deps: groupDeps,
        node,
      })
      result.push(node)
    }

    for (const section of canvas.sections ?? []) {
      const layout = sectionLayouts.get(section.id)
      if (!layout) {
        continue
      }

      const cacheKey = `section:${section.id}`
      const sectionKey = getSectionKey(section)
      const layoutKey = getLayoutKey(layout.width, layout.height)
      const isDropTarget = joinTargetSectionId === section.id || toolbarHoverSectionId === section.id
      const sectionDeps = [
        handleSectionTitleChange,
        handleSectionLayoutChange,
        handleSectionColumnsChange,
        handleSectionDrag,
        handleSectionDragStart,
        handleSectionDragEnd,
        handleDeleteSection,
      ]
      const cached = nodesCacheRef.current.get(cacheKey)
      const dimensions = { width: layout.width, height: layout.height }

      if (
        cached &&
        cached.sectionKey === sectionKey &&
        cached.layoutKey === layoutKey &&
        cached.dropTarget === isDropTarget &&
        areDepsEqual(cached.deps, sectionDeps)
      ) {
        newCache.set(cacheKey, cached)
        result.push(cached.node)
        continue
      }

      const node: ProjectedCanvasNode = {
        id: section.id,
        type: 'sectionBackground' as const,
        position: section.position,
        width: dimensions.width,
        height: dimensions.height,
        measured: dimensions,
        zIndex: -2,
        data: {
          title: section.title,
          layout: section.layout,
          columns: section.columns,
          isDropTarget,
          onTitleChange: handleSectionTitleChange,
          onLayoutChange: handleSectionLayoutChange,
          onColumnsChange: handleSectionColumnsChange,
          onSectionDrag: handleSectionDrag,
          onSectionDragStart: handleSectionDragStart,
          onSectionDragEnd: handleSectionDragEnd,
          onDeleteSection: handleDeleteSection,
        },
        style: dimensions,
        draggable: false,
        selectable: false,
        focusable: false,
      }

      newCache.set(cacheKey, {
        sectionKey,
        layoutKey,
        dropTarget: isDropTarget,
        deps: sectionDeps,
        node,
      })
      result.push(node)
    }

    nodesCacheRef.current = newCache
    return result
  }, [
    canvas,
    groupedIds,
    groupGrids,
    draggingNodeIdsRef,
    joinTargetGroupId,
    joinTargetSectionId,
    toolbarHoverSectionId,
    onCanvasSelect,
    onFocusNode,
    onSelectNode,
    onDeselectNode,
    onWorkspaceLinkNavigate,
    onExpandNode,
    onCollapseNode,
    handleGroupColorChange,
    handleGroupColumnsChange,
    handleGroupDrag,
    handleGroupNameChange,
    handleSectionTitleChange,
    handleSectionLayoutChange,
    handleSectionColumnsChange,
    handleSectionDrag,
    handleSectionDragStart,
    handleSectionDragEnd,
    handleDeleteSection,
    canonicalKanwasNodeId,
    selectedNodeIds,
  ])
}
