import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import {
  getInitialFitOverlayStyle,
  getWorkspaceRouteForCanvas,
  normalizeRouteCanvasPath,
  resolveCanvasAfterStructureChange,
  resolveCanvasFromRoute,
  shouldShowActiveCanvasInitialFitOverlay,
  shouldKeepProgrammaticNodeTarget,
} from '@/pages/workspacePageState'

function createNode(id: string, name: string): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    },
  }
}

function createCanvas(id: string, name: string, items: Array<CanvasItem | NodeItem>): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

function createWorkspaceRoot(items: Array<CanvasItem | NodeItem>): CanvasItem {
  return createCanvas('root', '', items)
}

describe('workspace page state', () => {
  it('keeps the active canvas when it still exists', () => {
    const childCanvas = createCanvas('child', 'Child', [])
    const root = createCanvas('root', 'Root', [childCanvas])

    expect(resolveCanvasAfterStructureChange(root, childCanvas.id)).toBe(childCanvas.id)
  })

  it('falls back to root when the active nested canvas no longer exists', () => {
    const root = createCanvas('root', 'Root', [])

    expect(resolveCanvasAfterStructureChange(root, 'deleted-child')).toBe('root')
  })

  it('returns null when there is no active canvas yet', () => {
    const root = createCanvas('root', 'Root', [])

    expect(resolveCanvasAfterStructureChange(root, null)).toBeNull()
    expect(resolveCanvasAfterStructureChange(null, 'child')).toBeNull()
  })

  it('normalizes route canvas paths before reconciliation', () => {
    expect(normalizeRouteCanvasPath(' nested/path/ ')).toBe('nested/path')
    expect(normalizeRouteCanvasPath('/nested/path///')).toBe('nested/path')
    expect(normalizeRouteCanvasPath('   ')).toBe('')
  })

  it('resolves nested route paths and falls back to null for invalid paths', () => {
    const nestedCanvas = createCanvas('nested', 'Nested Folder', [createNode('node-1', 'Plan')])
    const root = createWorkspaceRoot([createCanvas('parent', 'Parent Folder', [nestedCanvas])])

    expect(resolveCanvasFromRoute(root, '/parent-folder/nested-folder/')).toBe('nested')
    expect(resolveCanvasFromRoute(root, '')).toBe('root')
    expect(resolveCanvasFromRoute(root, 'missing/folder')).toBeNull()
  })

  it('builds canonical workspace routes from the active canvas', () => {
    const workspaceId = '12345678-1234-1234-1234-123456789abc'
    const nestedCanvas = createCanvas('nested', 'Nested Folder', [])
    const root = createWorkspaceRoot([createCanvas('parent', 'Parent Folder', [nestedCanvas])])

    expect(getWorkspaceRouteForCanvas(workspaceId, root, null)).toBe('/w/12345678123412341234123456789abc')
    expect(getWorkspaceRouteForCanvas(workspaceId, root, 'root')).toBe('/w/12345678123412341234123456789abc')
    expect(getWorkspaceRouteForCanvas(workspaceId, root, 'nested')).toBe(
      '/w/12345678123412341234123456789abc/parent-folder/nested-folder'
    )
  })

  it('clears one-shot programmatic node targets when user selection changes', () => {
    expect(shouldKeepProgrammaticNodeTarget('node-1', ['node-1'])).toBe(true)
    expect(shouldKeepProgrammaticNodeTarget('node-1', ['node-2'])).toBe(false)
    expect(shouldKeepProgrammaticNodeTarget('node-1', [])).toBe(false)
    expect(shouldKeepProgrammaticNodeTarget('node-1', ['node-1', 'node-2'])).toBe(false)
    expect(shouldKeepProgrammaticNodeTarget(null, ['node-1'])).toBe(false)
  })

  it('shows the initial-fit overlay before active canvas open handling has completed', () => {
    expect(
      shouldShowActiveCanvasInitialFitOverlay({
        activeCanvasId: 'canvas-1',
        lastHandledCanvasId: null,
        fitCanvasRequest: null,
      })
    ).toBe(true)
  })

  it('shows the initial-fit overlay while the active canvas fit request is pending', () => {
    expect(
      shouldShowActiveCanvasInitialFitOverlay({
        activeCanvasId: 'canvas-1',
        lastHandledCanvasId: 'canvas-1',
        fitCanvasRequest: { canvasId: 'canvas-1' },
      })
    ).toBe(true)
  })

  it('hides the initial-fit overlay after handling when no fit request is pending', () => {
    expect(
      shouldShowActiveCanvasInitialFitOverlay({
        activeCanvasId: 'canvas-1',
        lastHandledCanvasId: 'canvas-1',
        fitCanvasRequest: null,
      })
    ).toBe(false)
  })

  it('ignores stale fit requests for another canvas', () => {
    expect(
      shouldShowActiveCanvasInitialFitOverlay({
        activeCanvasId: 'canvas-1',
        lastHandledCanvasId: 'canvas-1',
        fitCanvasRequest: { canvasId: 'canvas-2' },
      })
    ).toBe(false)
  })

  it('shows the initial-fit overlay immediately without a fade-in', () => {
    expect(getInitialFitOverlayStyle(true)).toEqual({
      opacity: 1,
      pointerEvents: 'auto',
      transition: 'none',
    })
  })

  it('fades out the initial-fit overlay without blocking pointer events', () => {
    expect(getInitialFitOverlayStyle(false)).toEqual({
      opacity: 0,
      pointerEvents: 'none',
      transition: 'opacity 150ms ease-out',
    })
  })
})
