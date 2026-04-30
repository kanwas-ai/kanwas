import type { CanvasItem } from 'shared'
import { findCanvasById, getCanonicalCanvasPath, resolveCanvasPath } from '@/lib/workspaceUtils'
import { toUrlUuid } from '@/utils/uuid'

export function resolveCanvasAfterStructureChange(
  root: CanvasItem | null,
  activeCanvasId: string | null
): string | null {
  if (!root || !activeCanvasId) {
    return null
  }

  return findCanvasById(root, activeCanvasId) ? activeCanvasId : 'root'
}

export function shouldKeepProgrammaticNodeTarget(targetNodeId: string | null, selectedNodeIds: string[]): boolean {
  if (!targetNodeId) {
    return false
  }

  return selectedNodeIds.length === 1 && selectedNodeIds[0] === targetNodeId
}

export function shouldShowActiveCanvasInitialFitOverlay({
  activeCanvasId,
  lastHandledCanvasId,
  fitCanvasRequest,
}: {
  activeCanvasId: string | null
  lastHandledCanvasId: string | null
  fitCanvasRequest: { canvasId: string } | null
}): boolean {
  if (!activeCanvasId) {
    return false
  }

  if (lastHandledCanvasId !== activeCanvasId) {
    return true
  }

  return fitCanvasRequest?.canvasId === activeCanvasId
}

export function getInitialFitOverlayStyle(isVisible: boolean): {
  opacity: number
  pointerEvents: 'auto' | 'none'
  transition: string
} {
  return {
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none',
    transition: isVisible ? 'none' : 'opacity 150ms ease-out',
  }
}

export function normalizeRouteCanvasPath(routeCanvasPath: string): string {
  return routeCanvasPath.trim().replace(/^\/+|\/+$/gu, '')
}

export function resolveCanvasFromRoute(root: CanvasItem, routeCanvasPath: string): string | null {
  const normalizedRouteCanvasPath = normalizeRouteCanvasPath(routeCanvasPath)

  if (normalizedRouteCanvasPath.length === 0) {
    return 'root'
  }

  return resolveCanvasPath(root, `/workspace/${normalizedRouteCanvasPath}/`)
}

export function getWorkspaceRouteForCanvas(
  workspaceId: string,
  root: CanvasItem | null,
  activeCanvasId: string | null
): string {
  const workspaceRoutePrefix = `/w/${toUrlUuid(workspaceId)}`

  if (!root || !activeCanvasId || activeCanvasId === 'root') {
    return workspaceRoutePrefix
  }

  const canonicalCanvasPath = getCanonicalCanvasPath(root, activeCanvasId)
  if (!canonicalCanvasPath) {
    return workspaceRoutePrefix
  }

  return `${workspaceRoutePrefix}/${canonicalCanvasPath}`
}
