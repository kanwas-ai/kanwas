import { PathMapper } from 'shared/path-mapper'
import type { CanvasItem } from 'shared'
import { buildWorkspaceHref } from 'shared/workspace-interlink'

export interface WorkspaceInterlinkSuggestion {
  id: string
  kind: 'node' | 'canvas'
  title: string
  href: string
  canonicalPath: string
  parentCanvasId: string
  parentCanvasName: string
  menuGroup?: string
  aliases: string[]
}

function normalizeSuggestionTitle(name: string, fallback: string): string {
  const trimmedName = name.trim()
  if (trimmedName.length > 0) {
    return trimmedName
  }
  return fallback
}

function findCanvasById(canvas: CanvasItem, targetCanvasId: string): CanvasItem | null {
  if (canvas.id === targetCanvasId) {
    return canvas
  }

  for (const item of canvas.items) {
    if (item.kind !== 'canvas') {
      continue
    }

    const found = findCanvasById(item, targetCanvasId)
    if (found) {
      return found
    }
  }

  return null
}

function resolveActiveCanvas(root: CanvasItem, activeCanvasId: string | null): CanvasItem {
  if (!activeCanvasId || activeCanvasId === 'root' || activeCanvasId === root.id) {
    return root
  }

  return findCanvasById(root, activeCanvasId) ?? root
}

function getCanvasTitle(canvas: CanvasItem, rootCanvasId: string): string {
  if (canvas.id === rootCanvasId) {
    return 'Home'
  }

  return normalizeSuggestionTitle(canvas.name, 'Untitled Canvas')
}

interface CanvasInfo {
  id: string
  canvas: CanvasItem
  path: string
  title: string
  parentId: string | null
  childCanvasIds: string[]
  order: number
}

function collectCanvasInfos(root: CanvasItem, pathMapper: PathMapper): Map<string, CanvasInfo> {
  const infos = new Map<string, CanvasInfo>()
  let order = 0

  const visit = (canvas: CanvasItem, parentId: string | null): void => {
    const childCanvases = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')

    infos.set(canvas.id, {
      id: canvas.id,
      canvas,
      path: pathMapper.getPathForCanvas(canvas.id) ?? '',
      title: getCanvasTitle(canvas, root.id),
      parentId,
      childCanvasIds: childCanvases.map((child) => child.id),
      order: order++,
    })

    for (const childCanvas of childCanvases) {
      visit(childCanvas, canvas.id)
    }
  }

  visit(root, null)
  return infos
}

function buildCanvasDistanceMap(canvasInfos: Map<string, CanvasInfo>, startCanvasId: string): Map<string, number> {
  const distances = new Map<string, number>()
  const queue: string[] = [startCanvasId]
  distances.set(startCanvasId, 0)

  for (let index = 0; index < queue.length; index++) {
    const currentId = queue[index]
    const currentDistance = distances.get(currentId)
    const currentCanvas = canvasInfos.get(currentId)
    if (currentDistance === undefined || !currentCanvas) {
      continue
    }

    const neighbors = [...currentCanvas.childCanvasIds]
    if (currentCanvas.parentId) {
      neighbors.push(currentCanvas.parentId)
    }

    for (const neighborId of neighbors) {
      if (distances.has(neighborId) || !canvasInfos.has(neighborId)) {
        continue
      }

      distances.set(neighborId, currentDistance + 1)
      queue.push(neighborId)
    }
  }

  return distances
}

function getCanvasGroupLabel(canvasPath: string): string {
  if (canvasPath.length === 0) {
    return 'Home'
  }

  return canvasPath
}

export function buildWorkspaceInterlinkSuggestions(
  root: CanvasItem,
  activeCanvasId: string | null
): WorkspaceInterlinkSuggestion[] {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace({ root })

  const suggestions: WorkspaceInterlinkSuggestion[] = []
  const activeCanvas = resolveActiveCanvas(root, activeCanvasId)
  const canvasInfos = collectCanvasInfos(root, pathMapper)
  const activeCanvasInfo = canvasInfos.get(activeCanvas.id)
  if (!activeCanvasInfo) {
    return suggestions
  }

  const distanceMap = buildCanvasDistanceMap(canvasInfos, activeCanvasInfo.id)

  const addCanvasItems = (canvasInfo: CanvasInfo, menuGroup?: string): void => {
    for (const item of canvasInfo.canvas.items) {
      if (item.kind === 'node') {
        const nodePath = pathMapper.getPathForNode(item.id)
        if (!nodePath) {
          continue
        }

        const nodeTitle = normalizeSuggestionTitle(item.name, 'Untitled')
        const aliases = [nodePath, nodeTitle, canvasInfo.title]
        if (canvasInfo.path.length > 0) {
          aliases.push(canvasInfo.path)
        } else {
          aliases.push('Home')
        }
        if (menuGroup) {
          aliases.push(menuGroup)
        }

        suggestions.push({
          id: item.id,
          kind: 'node',
          title: nodeTitle,
          href: buildWorkspaceHref(nodePath),
          canonicalPath: nodePath,
          parentCanvasId: canvasInfo.id,
          parentCanvasName: canvasInfo.title,
          menuGroup,
          aliases,
        })
        continue
      }
      const childCanvas = item
      const childCanvasPath = pathMapper.getPathForCanvas(childCanvas.id) ?? ''

      const childCanvasInfo = canvasInfos.get(childCanvas.id)
      const childCanvasTitle = childCanvasInfo?.title ?? getCanvasTitle(childCanvas, root.id)
      const aliases = [childCanvasPath, childCanvasTitle, canvasInfo.title]
      if (canvasInfo.path.length > 0) {
        aliases.push(canvasInfo.path)
      } else {
        aliases.push('Home')
      }
      if (menuGroup) {
        aliases.push(menuGroup)
      }

      suggestions.push({
        id: childCanvas.id,
        kind: 'canvas',
        title: childCanvasTitle,
        href: buildWorkspaceHref(childCanvasPath, { trailingSlash: true }),
        canonicalPath: childCanvasPath,
        parentCanvasId: canvasInfo.id,
        parentCanvasName: canvasInfo.title,
        menuGroup,
        aliases,
      })
    }
  }

  addCanvasItems(activeCanvasInfo)

  const activeParentId = activeCanvasInfo.parentId
  const otherCanvases = Array.from(canvasInfos.values())
    .filter((canvasInfo) => canvasInfo.id !== activeCanvasInfo.id)
    .sort((a, b) => {
      const aDistance = distanceMap.get(a.id) ?? Number.POSITIVE_INFINITY
      const bDistance = distanceMap.get(b.id) ?? Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) {
        return aDistance - bDistance
      }

      const aIsActiveParent = a.id === activeParentId
      const bIsActiveParent = b.id === activeParentId
      if (aIsActiveParent !== bIsActiveParent) {
        return aIsActiveParent ? -1 : 1
      }

      return a.order - b.order
    })

  for (const canvasInfo of otherCanvases) {
    addCanvasItems(canvasInfo, getCanvasGroupLabel(canvasInfo.path))
  }

  return suggestions
}

export function filterWorkspaceInterlinkSuggestions(
  suggestions: WorkspaceInterlinkSuggestion[],
  query: string
): WorkspaceInterlinkSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    return suggestions
  }

  return suggestions.filter((suggestion) => {
    if (suggestion.title.toLowerCase().includes(normalizedQuery)) {
      return true
    }

    if (suggestion.canonicalPath.toLowerCase().includes(normalizedQuery)) {
      return true
    }

    return suggestion.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
  })
}
