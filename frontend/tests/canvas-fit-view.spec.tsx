import React, { useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import {
  calculateCanvasFitViewport,
  collectRenderedNodeBounds,
  type CanvasFitItemBounds,
  type CanvasFitVisibleArea,
} from '@/components/canvas/canvasFitView'
import { useCanvasExternalFocus } from '@/components/canvas/useCanvasExternalFocus'
import { useCanvasViewportState } from '@/components/canvas/useCanvasViewportState'
import { useInitialCanvasFitRequest } from '@/components/canvas/useInitialCanvasFitRequest'
import { CANVAS } from '@/components/canvas/constants'
import { ui } from '@/store/useUIStore'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const getCanvasViewportMock = vi.fn()
const setCanvasViewportMock = vi.fn()

vi.mock('@/hooks/workspaceStorage', () => ({
  getCanvasViewport: (...args: unknown[]) => getCanvasViewportMock(...args),
  setCanvasViewport: (...args: unknown[]) => setCanvasViewportMock(...args),
}))

vi.mock('@/lib/CursorManager', () => ({
  default: class CursorManagerMock {
    attach() {}
    destroy() {}
    refresh() {}
    setReactFlowInstance() {}
  },
}))

function createNode(id: string, x: number, y: number): NodeItem {
  return {
    kind: 'node',
    id,
    name: id,
    xynode: {
      id,
      type: 'blockNote',
      position: { x, y },
      data: {},
    },
  }
}

function createCanvas(items: Array<CanvasItem | NodeItem>): CanvasItem {
  return {
    kind: 'canvas',
    id: 'canvas-1',
    name: 'Canvas 1',
    xynode: {
      id: 'canvas-1',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

function FolderOpenFitProbe({
  canvas,
  selectedNodeId,
  fitCanvasRequestKey,
  getNode,
  setViewport,
  fitNodeInView,
  onFitCanvasRequestHandled,
  renderedNodeIds,
}: {
  canvas: CanvasItem
  selectedNodeId: string
  fitCanvasRequestKey: string
  renderedNodeIds?: string[]
  getNode: (nodeId: string) => {
    position: { x: number; y: number }
    measured?: { width?: number; height?: number }
    width?: number
    height?: number
    style?: { width?: number | string; height?: number | string }
  } | null
  setViewport: ReturnType<typeof vi.fn>
  fitNodeInView: ReturnType<typeof vi.fn>
  onFitCanvasRequestHandled: ReturnType<typeof vi.fn>
}) {
  const canvasSurfaceRef = useRef<HTMLDivElement>(null)

  useCanvasViewportState({
    workspaceId: 'workspace-1',
    canvasId: canvas.id,
    selectedNodeId,
    focusedNodeId: null,
    deferDefaultViewportRestore: true,
    focusMode: false,
    savedViewport: null,
    provider: {} as never,
    localUserId: 'user-1',
    isCursorPresenceSuppressed: () => false,
    acquireCursorPresenceSuppression: () => () => undefined,
    screenToFlowPosition: (() => ({ x: 0, y: 0 })) as never,
    flowToScreenPosition: (() => ({ x: 0, y: 0 })) as never,
    setViewport: setViewport as never,
    canvasSurfaceRef,
  })

  useInitialCanvasFitRequest({
    workspaceId: 'workspace-1',
    canvasId: canvas.id,
    canvasItems: canvas.items,
    renderedNodeIds: renderedNodeIds ?? canvas.items.map((item) => item.id),
    fitCanvasRequestKey,
    getNode: ((nodeId: string) => getNode(nodeId)) as never,
    setViewport: setViewport as never,
    onFitCanvasRequestHandled,
  })

  useCanvasExternalFocus({
    canvas,
    workspaceId: 'workspace-1',
    selectedNodeId,
    focusedNodeId: null,
    fitSelectedNode: false,
    suppressSelectedNodeFallbackFit: true,
    focusMode: false,
    focusModeNodeId: null,
    savedViewport: null,
    enterFocusMode: (() => undefined) as never,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: setViewport as never,
    fitNodeInView,
    focusNodeAt100: () => ({ found: false, moved: false }),
    setSelectedNodeIds: () => undefined,
    onNodeFocused: () => undefined,
  })

  return <div ref={canvasSurfaceRef} />
}

describe('canvas fit view', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let originalInnerWidth = 0
  let originalInnerHeight = 0
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame

  beforeEach(() => {
    getCanvasViewportMock.mockReset()
    setCanvasViewportMock.mockReset()
    ui.sidebarOpen = true
    ui.zenMode = false
    ui.fullScreenMode = false
    ui.chatWidth = 480
    ui.sidebarWidth = 220

    originalInnerWidth = window.innerWidth
    originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    vi.useFakeTimers()
    originalRequestAnimationFrame = window.requestAnimationFrame
    originalCancelAnimationFrame = window.cancelAnimationFrame
    window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16)) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((handle: number) =>
      window.clearTimeout(handle)) as typeof window.cancelAnimationFrame
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount()
      })
      container.remove()
    }

    root = null
    container = null
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    vi.useRealTimers()
  })

  it('returns null for empty bounds', () => {
    const visibleArea: CanvasFitVisibleArea = {
      availableWidth: 900,
      availableHeight: 700,
      centerX: 450,
      centerY: 350,
    }

    expect(calculateCanvasFitViewport([], visibleArea)).toBeNull()
  })

  it('fits and centers multiple bounds inside the visible area', () => {
    const bounds: CanvasFitItemBounds[] = [
      { x: 100, y: 120, width: 300, height: 200 },
      { x: 760, y: 420, width: 240, height: 160 },
    ]
    const visibleArea: CanvasFitVisibleArea = {
      availableWidth: 900,
      availableHeight: 900,
      centerX: 450,
      centerY: 450,
    }

    const viewport = calculateCanvasFitViewport(bounds, visibleArea)

    expect(viewport).not.toBeNull()
    expect(viewport?.zoom).toBeCloseTo(700 / 900, 5)
    expect(viewport?.x).toBeCloseTo(22.22222, 4)
    expect(viewport?.y).toBeCloseTo(177.77778, 4)
  })

  it('clamps fit zoom to the maximum zoom level', () => {
    const bounds: CanvasFitItemBounds[] = [{ x: 100, y: 100, width: 40, height: 30 }]
    const visibleArea: CanvasFitVisibleArea = {
      availableWidth: 1600,
      availableHeight: 900,
      centerX: 800,
      centerY: 450,
    }

    const viewport = calculateCanvasFitViewport(bounds, visibleArea)

    expect(viewport?.zoom).toBe(2)
  })

  it('clamps fit zoom to the minimum zoom level', () => {
    const bounds: CanvasFitItemBounds[] = [{ x: 100, y: 100, width: 20000, height: 8000 }]
    const visibleArea: CanvasFitVisibleArea = {
      availableWidth: 900,
      availableHeight: 700,
      centerX: 450,
      centerY: 350,
    }

    const viewport = calculateCanvasFitViewport(bounds, visibleArea)

    expect(viewport?.zoom).toBe(0.1)
  })

  it('collects bounds for rendered synthetic canvas nodes', () => {
    const bounds = collectRenderedNodeBounds(['section-1'], () => ({
      position: { x: 80, y: 40 },
      style: { width: 1200, height: 520 },
    }))

    expect(bounds).toEqual([{ x: 80, y: 40, width: 1200, height: 520 }])
  })

  it('fits the canvas instead of the restored selected node on first folder open', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 100, 120), createNode('node-2', 760, 420)])
    const setViewport = vi.fn()
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 100, y: 120 },
          measured: { width: 320, height: 180 },
        }
      }

      if (nodeId === 'node-2') {
        return {
          position: { x: 760, y: 420 },
          measured: { width: 280, height: 220 },
        }
      }

      return null
    })

    const expectedViewport = calculateCanvasFitViewport(
      [
        { x: 100, y: 120, width: 320, height: 180 },
        { x: 760, y: 420, width: 280, height: 220 },
      ],
      {
        availableWidth: 900,
        availableHeight: 900,
        centerX: 450,
        centerY: 450,
      },
      {
        padding: CANVAS.FIRST_OPEN_FIT_COMPACT_PADDING,
      }
    )

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:1"
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fitNodeInView).not.toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledWith(expectedViewport, { duration: 0 })
    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:1')
  })

  it('keeps small first-open canvases capped at 80% with roomy padding', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 100, 120)])
    const setViewport = vi.fn()
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 100, y: 120 },
          measured: { width: 120, height: 80 },
        }
      }

      return null
    })

    const expectedViewport = calculateCanvasFitViewport(
      [{ x: 100, y: 120, width: 120, height: 80 }],
      {
        availableWidth: 900,
        availableHeight: 900,
        centerX: 450,
        centerY: 450,
      },
      {
        maxZoom: CANVAS.FIRST_OPEN_FIT_SMALL_CONTENT_MAX_ZOOM,
      }
    )

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:tiny"
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fitNodeInView).not.toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledWith(expectedViewport, { duration: 0 })
    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:tiny')
  })

  it('uses compact first-open padding without a custom zoom floor for large content', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 0, 120), createNode('node-2', 2_200, 420)])
    const setViewport = vi.fn()
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 0, y: 120 },
          measured: { width: 320, height: 180 },
        }
      }

      if (nodeId === 'node-2') {
        return {
          position: { x: 2_200, y: 420 },
          measured: { width: 320, height: 180 },
        }
      }

      return null
    })

    const expectedViewport = calculateCanvasFitViewport(
      [
        { x: 0, y: 120, width: 320, height: 180 },
        { x: 2_200, y: 420, width: 320, height: 180 },
      ],
      {
        availableWidth: 900,
        availableHeight: 900,
        centerX: 450,
        centerY: 450,
      },
      {
        padding: CANVAS.FIRST_OPEN_FIT_COMPACT_PADDING,
      }
    )

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:large"
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fitNodeInView).not.toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledWith(expectedViewport, { duration: 0 })
    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:large')
  })

  it('waits to mark the first-open fit handled until after the viewport update can paint', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 100, 120)])
    let resolveViewportCommit: () => void = () => undefined
    const viewportCommit = new Promise<void>((resolve) => {
      resolveViewportCommit = resolve
    })
    const setViewport = vi.fn(() => viewportCommit)
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 100, y: 120 },
          measured: { width: 320, height: 180 },
        }
      }

      return null
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:paint"
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.advanceTimersByTime(86)
      await Promise.resolve()
    })

    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(onFitCanvasRequestHandled).not.toHaveBeenCalled()

    await act(async () => {
      resolveViewportCommit()
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(16)
      await Promise.resolve()
    })

    expect(onFitCanvasRequestHandled).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(16)
      await Promise.resolve()
    })

    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:paint')
  })

  it('includes rendered section and group backgrounds in the first-open fit bounds', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 100, 120), createNode('node-2', 760, 420)])
    const setViewport = vi.fn()
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 100, y: 120 },
          measured: { width: 320, height: 180 },
        }
      }

      if (nodeId === 'node-2') {
        return {
          position: { x: 760, y: 420 },
          measured: { width: 280, height: 220 },
        }
      }

      if (nodeId === 'section-1') {
        return {
          position: { x: 50, y: 40 },
          style: { width: 1400, height: 600 },
        }
      }

      return null
    })

    const expectedViewport = calculateCanvasFitViewport(
      [
        { x: 100, y: 120, width: 320, height: 180 },
        { x: 760, y: 420, width: 280, height: 220 },
        { x: 50, y: 40, width: 1400, height: 600 },
      ],
      {
        availableWidth: 900,
        availableHeight: 900,
        centerX: 450,
        centerY: 450,
      },
      {
        padding: CANVAS.FIRST_OPEN_FIT_COMPACT_PADDING,
      }
    )

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:section"
          renderedNodeIds={['node-1', 'node-2', 'section-1']}
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(fitNodeInView).not.toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledWith(expectedViewport, { duration: 0 })
    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:section')
  })

  it('waits 70ms before calculating the first-open canvas view', async () => {
    getCanvasViewportMock.mockReturnValue(null)

    const canvas = createCanvas([createNode('node-1', 100, 120), createNode('node-2', 760, 420)])
    const setViewport = vi.fn()
    const fitNodeInView = vi.fn()
    const onFitCanvasRequestHandled = vi.fn()
    let useFinalMeasurements = false

    window.setTimeout(() => {
      useFinalMeasurements = true
    }, 48)

    const getNode = vi.fn((nodeId: string) => {
      if (nodeId === 'node-1') {
        return {
          position: { x: 100, y: 120 },
          measured: {
            width: 320,
            height: useFinalMeasurements ? 360 : 180,
          },
        }
      }

      if (nodeId === 'node-2') {
        return {
          position: { x: 760, y: 420 },
          measured: {
            width: 280,
            height: useFinalMeasurements ? 300 : 220,
          },
        }
      }

      return null
    })

    const expectedViewport = calculateCanvasFitViewport(
      [
        { x: 100, y: 120, width: 320, height: 360 },
        { x: 760, y: 420, width: 280, height: 300 },
      ],
      {
        availableWidth: 900,
        availableHeight: 900,
        centerX: 450,
        centerY: 450,
      },
      {
        padding: CANVAS.FIRST_OPEN_FIT_COMPACT_PADDING,
      }
    )

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <FolderOpenFitProbe
          canvas={canvas}
          selectedNodeId="node-1"
          fitCanvasRequestKey="canvas-1:2"
          getNode={getNode}
          setViewport={setViewport}
          fitNodeInView={fitNodeInView}
          onFitCanvasRequestHandled={onFitCanvasRequestHandled}
        />
      )
    })

    await act(async () => {
      vi.advanceTimersByTime(69)
      await Promise.resolve()
    })

    expect(setViewport).not.toHaveBeenCalled()
    expect(onFitCanvasRequestHandled).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(17)
      await Promise.resolve()
    })

    expect(setViewport).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledWith(expectedViewport, { duration: 0 })
    expect(onFitCanvasRequestHandled).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(32)
      await Promise.resolve()
    })

    expect(onFitCanvasRequestHandled).toHaveBeenCalledWith('canvas-1:2')
    expect(fitNodeInView).not.toHaveBeenCalled()
  })
})
