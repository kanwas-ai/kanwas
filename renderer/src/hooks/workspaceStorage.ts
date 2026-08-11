// LocalStorage helpers for persisting workspace state (active canvas, selected nodes, viewport)

const LAST_WORKSPACE_KEY = 'kanwas:lastWorkspace'
const LAST_SELECTED_KEY_PREFIX = 'kanwas:lastSelectedNode:'
const LAST_CANVAS_KEY_PREFIX = 'kanwas:lastActiveCanvas:'
const VIEWPORT_KEY_PREFIX = 'kanwas:viewport:'

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
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

export function rememberWorkspaceVisit(workspaceId: string): void {
  setLastWorkspace(workspaceId)
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
