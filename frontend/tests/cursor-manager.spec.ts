import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactFlowInstance } from '@xyflow/react'
import type { WorkspaceSocketProviderInstance } from 'shared'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import CursorManager from '@/lib/CursorManager'

function createProviderHarness() {
  const doc = new Y.Doc()
  const awareness = new Awareness(doc)

  return {
    awareness,
    cleanup() {
      awareness.destroy()
      doc.destroy()
    },
    provider: {
      awareness,
    } as WorkspaceSocketProviderInstance,
  }
}

function createRemoteHarness() {
  const doc = new Y.Doc()
  const awareness = new Awareness(doc)

  return {
    awareness,
    cleanup() {
      awareness.destroy()
      doc.destroy()
    },
  }
}

function syncAwarenessState(target: Awareness, source: Awareness) {
  const clientIds = Array.from(source.getStates().keys())
  applyAwarenessUpdate(target, encodeAwarenessUpdate(source, clientIds), 'remote-test')
}

function createReactFlowHarness(
  options: {
    flowToScreenPosition?: ({ x, y }: { x: number; y: number }) => { x: number; y: number }
    screenToFlowPosition?: ({ x, y }: { x: number; y: number }) => { x: number; y: number }
  } = {}
): ReactFlowInstance {
  return {
    flowToScreenPosition: options.flowToScreenPosition ?? ((position) => position),
    screenToFlowPosition: options.screenToFlowPosition ?? ((position) => position),
  } as ReactFlowInstance
}

function createCanvasContainer(left = 50, top = 60): HTMLDivElement {
  const container = document.createElement('div')
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(left, top, 800, 600),
  })
  document.body.appendChild(container)
  return container
}

function createCursorManager(
  provider: WorkspaceSocketProviderInstance,
  options: { isPublishingSuppressed?: () => boolean; userId?: string } = {}
) {
  return new CursorManager(provider, {
    isPublishingSuppressed: options.isPublishingSuppressed ?? (() => false),
    userId: options.userId ?? 'local-user',
  })
}

describe('CursorManager', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }

    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('publishes canvas-scoped cursor positions using client coordinates', () => {
    const providerHarness = createProviderHarness()
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const screenToFlowPosition = vi.fn(({ x, y }: { x: number; y: number }) => ({
      x: x - 100,
      y: y - 200,
    }))
    const container = createCanvasContainer()

    manager.setReactFlowInstance(
      createReactFlowHarness({
        screenToFlowPosition,
      })
    )
    manager.attach(container, 'canvas-a')

    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 260 }))

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 150, y: 260 })

    const localState = providerHarness.awareness.getLocalState() as {
      appCursor?: { canvasId: string; x: number; y: number; timestamp: number }
    }

    expect(localState.appCursor).toMatchObject({
      canvasId: 'canvas-a',
      x: 50,
      y: 60,
    })
    expect(localState.appCursor?.timestamp).toEqual(expect.any(Number))
  })

  it('ignores pointer movement outside the attached surface', () => {
    const providerHarness = createProviderHarness()
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const screenToFlowPosition = vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y }))
    const wrapper = document.createElement('div')
    const surface = document.createElement('div')
    const floatingButton = document.createElement('button')

    Object.defineProperty(surface, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 800, 600),
    })

    wrapper.appendChild(surface)
    wrapper.appendChild(floatingButton)
    document.body.appendChild(wrapper)

    manager.setReactFlowInstance(
      createReactFlowHarness({
        screenToFlowPosition,
      })
    )
    manager.attach(surface, 'canvas-a')

    floatingButton.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 400 }))

    expect(screenToFlowPosition).not.toHaveBeenCalled()
    expect((providerHarness.awareness.getLocalState() as { appCursor?: unknown }).appCursor).toBeNull()

    surface.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 260 }))

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 150, y: 260 })
  })

  it('renders remote cursors only for the active canvas', () => {
    const providerHarness = createProviderHarness()
    const remoteHarness = createRemoteHarness()
    cleanups.push(() => remoteHarness.cleanup())
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const container = createCanvasContainer()
    manager.setReactFlowInstance(
      createReactFlowHarness({
        flowToScreenPosition: ({ x, y }) => ({ x: x + 100, y: y + 200 }),
      })
    )
    manager.attach(container, 'canvas-a')

    const now = Date.now()

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-b', x: 10, y: 20, timestamp: now },
      appUser: { id: 'remote-user', name: 'Remote User', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    expect(container.querySelector('.remote-cursor')).toBeNull()

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: now + 1 },
      appUser: { id: 'remote-user', name: 'Remote User', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    const cursor = container.querySelector('.remote-cursor') as HTMLDivElement | null
    expect(cursor).not.toBeNull()
    expect(cursor?.textContent).toContain('Remote User')
    expect(cursor?.style.left).toBe('60px')
    expect(cursor?.style.top).toBe('160px')
  })

  it('reprojects visible cursors when the viewport changes', () => {
    const providerHarness = createProviderHarness()
    const remoteHarness = createRemoteHarness()
    cleanups.push(() => remoteHarness.cleanup())
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    let screenOffsetX = 100
    let screenOffsetY = 200
    const container = createCanvasContainer()

    manager.setReactFlowInstance(
      createReactFlowHarness({
        flowToScreenPosition: ({ x, y }) => ({ x: x + screenOffsetX, y: y + screenOffsetY }),
      })
    )
    manager.attach(container, 'canvas-a')

    const now = Date.now()

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: now },
      appUser: { id: 'remote-user', name: 'Remote User', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    const cursor = container.querySelector('.remote-cursor') as HTMLDivElement | null
    expect(cursor?.style.left).toBe('60px')
    expect(cursor?.style.top).toBe('160px')

    screenOffsetX = 180
    screenOffsetY = 260
    manager.refresh()

    expect(cursor?.style.left).toBe('140px')
    expect(cursor?.style.top).toBe('220px')
  })

  it('updates remote cursor labels when appUser changes', () => {
    const providerHarness = createProviderHarness()
    const remoteHarness = createRemoteHarness()
    cleanups.push(() => remoteHarness.cleanup())
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const container = createCanvasContainer()
    manager.setReactFlowInstance(createReactFlowHarness())
    manager.attach(container, 'canvas-a')

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: Date.now() },
      appUser: { id: 'remote-user', name: 'Old Name', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    const cursor = container.querySelector('.remote-cursor') as HTMLDivElement | null
    expect(cursor?.textContent).toContain('Old Name')

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: Date.now() + 1 },
      appUser: { id: 'remote-user', name: 'New Name', color: '#112233' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    const label = cursor?.querySelector('.remote-cursor-label') as HTMLDivElement | null
    const pointer = cursor?.querySelector('[data-cursor-pointer]') as SVGPathElement | null

    expect(label?.textContent).toBe('New Name')
    expect(label?.style.background).toContain('linear-gradient')
    expect(label?.style.background).toContain('rgb(17, 34, 51)')
    expect(pointer?.getAttribute('fill')).toBe('#112233')
  })

  it('does not publish cursors while presence is suppressed', () => {
    vi.useFakeTimers()

    const providerHarness = createProviderHarness()
    cleanups.push(() => providerHarness.cleanup())

    let suppressed = true
    const manager = createCursorManager(providerHarness.provider, {
      isPublishingSuppressed: () => suppressed,
    })
    cleanups.push(() => manager.destroy())

    const screenToFlowPosition = vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y }))
    const container = createCanvasContainer()

    manager.setReactFlowInstance(
      createReactFlowHarness({
        screenToFlowPosition,
      })
    )
    manager.attach(container, 'canvas-a')

    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 260 }))

    expect(screenToFlowPosition).not.toHaveBeenCalled()
    expect((providerHarness.awareness.getLocalState() as { appCursor?: unknown }).appCursor).toBeNull()

    suppressed = false
    vi.advanceTimersByTime(51)
    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 300 }))

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 200, y: 300 })
    expect((providerHarness.awareness.getLocalState() as { appCursor?: { canvasId: string } }).appCursor).toMatchObject(
      {
        canvasId: 'canvas-a',
      }
    )
  })

  it('does not write appUser awareness state', () => {
    const providerHarness = createProviderHarness()
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    expect((providerHarness.awareness.getLocalState() as { appUser?: unknown } | null)?.appUser).toBeUndefined()
  })

  it('drops stale remote cursors after the inactivity ttl', () => {
    vi.useFakeTimers()

    const providerHarness = createProviderHarness()
    const remoteHarness = createRemoteHarness()
    cleanups.push(() => remoteHarness.cleanup())
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const container = createCanvasContainer()
    manager.setReactFlowInstance(createReactFlowHarness())
    manager.attach(container, 'canvas-a')

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: Date.now() },
      appUser: { id: 'remote-user', name: 'Remote User', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    expect(container.querySelector('.remote-cursor')).not.toBeNull()

    vi.advanceTimersByTime(90_001)

    expect(container.querySelector('.remote-cursor')).toBeNull()
  })

  it('ignores already-stale remote cursors', () => {
    const providerHarness = createProviderHarness()
    const remoteHarness = createRemoteHarness()
    cleanups.push(() => remoteHarness.cleanup())
    cleanups.push(() => providerHarness.cleanup())

    const manager = createCursorManager(providerHarness.provider)
    cleanups.push(() => manager.destroy())

    const container = createCanvasContainer()
    manager.setReactFlowInstance(createReactFlowHarness())
    manager.attach(container, 'canvas-a')

    remoteHarness.awareness.setLocalState({
      appCursor: { canvasId: 'canvas-a', x: 10, y: 20, timestamp: Date.now() - 90_001 },
      appUser: { id: 'remote-user', name: 'Remote User', color: '#ff00aa' },
    })
    syncAwarenessState(providerHarness.awareness, remoteHarness.awareness)

    expect(container.querySelector('.remote-cursor')).toBeNull()
  })
})
