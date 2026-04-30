// LocalStorage helpers for persisting workspace state (active canvas, selected nodes, viewport)

const LAST_WORKSPACE_KEY = 'kanwas:lastWorkspace'
const LAST_ORGANIZATION_KEY = 'kanwas:lastOrganization'
const LAST_WORKSPACE_BY_ORGANIZATION_KEY = 'kanwas:lastWorkspaceByOrganization'
const WORKSPACE_ORGANIZATION_MAP_KEY = 'kanwas:workspaceOrganizationMap'
const LAST_SELECTED_KEY_PREFIX = 'kanwas:lastSelectedNode:'
const LAST_CANVAS_KEY_PREFIX = 'kanwas:lastActiveCanvas:'
const VIEWPORT_KEY_PREFIX = 'kanwas:viewport:'

type StringMap = Record<string, string>

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

function getStoredMap(key: string): StringMap {
  try {
    const value = localStorage.getItem(key)
    if (!value) {
      return {}
    }

    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

function setStoredMap(key: string, value: StringMap): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore localStorage errors
  }
}

export function getLastWorkspace(): string | null {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function setLastWorkspace(workspaceId: string): void {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId)
  } catch {
    // Ignore localStorage errors
  }
}

export function getLastOrganization(): string | null {
  try {
    return localStorage.getItem(LAST_ORGANIZATION_KEY)
  } catch {
    return null
  }
}

export function setLastOrganization(organizationId: string): void {
  try {
    localStorage.setItem(LAST_ORGANIZATION_KEY, organizationId)
  } catch {
    // Ignore localStorage errors
  }
}

export function getLastWorkspaceForOrganization(organizationId: string): string | null {
  const map = getStoredMap(LAST_WORKSPACE_BY_ORGANIZATION_KEY)
  return map[organizationId] ?? null
}

export function setLastWorkspaceForOrganization(organizationId: string, workspaceId: string): void {
  const map = getStoredMap(LAST_WORKSPACE_BY_ORGANIZATION_KEY)
  map[organizationId] = workspaceId
  setStoredMap(LAST_WORKSPACE_BY_ORGANIZATION_KEY, map)
}

export function getOrganizationForWorkspace(workspaceId: string): string | null {
  const map = getStoredMap(WORKSPACE_ORGANIZATION_MAP_KEY)
  return map[workspaceId] ?? null
}

export function setOrganizationForWorkspace(workspaceId: string, organizationId: string): void {
  const map = getStoredMap(WORKSPACE_ORGANIZATION_MAP_KEY)
  map[workspaceId] = organizationId
  setStoredMap(WORKSPACE_ORGANIZATION_MAP_KEY, map)
}

export function rememberWorkspaceVisit(workspaceId: string, organizationId: string): void {
  setLastWorkspace(workspaceId)
  setLastOrganization(organizationId)
  setLastWorkspaceForOrganization(organizationId, workspaceId)
  setOrganizationForWorkspace(workspaceId, organizationId)
}

export function getLastSelectedNode(workspaceId: string, canvasId: string): string | null {
  try {
    return localStorage.getItem(`${LAST_SELECTED_KEY_PREFIX}${workspaceId}:${canvasId}`)
  } catch {
    return null
  }
}

export function setLastSelectedNode(workspaceId: string, canvasId: string, nodeId: string | null): void {
  try {
    const key = `${LAST_SELECTED_KEY_PREFIX}${workspaceId}:${canvasId}`
    if (nodeId) {
      localStorage.setItem(key, nodeId)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function getLastActiveCanvas(workspaceId: string): string | null {
  try {
    return localStorage.getItem(`${LAST_CANVAS_KEY_PREFIX}${workspaceId}`)
  } catch {
    return null
  }
}

export function setLastActiveCanvas(workspaceId: string, canvasId: string): void {
  try {
    localStorage.setItem(`${LAST_CANVAS_KEY_PREFIX}${workspaceId}`, canvasId)
  } catch {
    // Ignore localStorage errors
  }
}

export function getCanvasViewport(workspaceId: string, canvasId: string): CanvasViewport | null {
  try {
    const data = localStorage.getItem(`${VIEWPORT_KEY_PREFIX}${workspaceId}:${canvasId}`)
    if (data) {
      return JSON.parse(data) as CanvasViewport
    }
    return null
  } catch {
    return null
  }
}

export function setCanvasViewport(workspaceId: string, canvasId: string, viewport: CanvasViewport): void {
  try {
    localStorage.setItem(`${VIEWPORT_KEY_PREFIX}${workspaceId}:${canvasId}`, JSON.stringify(viewport))
  } catch {
    // Ignore localStorage errors
  }
}
