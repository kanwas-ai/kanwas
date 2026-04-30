import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoScroll } from '@/components/chat/useAutoScroll'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type AutoScrollDependency = string | number | boolean | null | undefined

interface HarnessProps {
  newContentDependencies: AutoScrollDependency[]
  updatedContentDependencies?: AutoScrollDependency[]
  enabled?: boolean
}

interface ScrollMetrics {
  clientHeight: number
  contentHeight: number
  scrollHeight: number
  scrollTop: number
}

function createRect(height: number, width = 320): DOMRectReadOnly {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  } as DOMRectReadOnly
}

class MockResizeObserver {
  static instances = new Set<MockResizeObserver>()

  private readonly elements = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.add(this)
  }

  observe = (element: Element) => {
    this.elements.add(element)
  }

  unobserve = (element: Element) => {
    this.elements.delete(element)
  }

  disconnect = () => {
    this.elements.clear()
    MockResizeObserver.instances.delete(this)
  }

  static reset() {
    MockResizeObserver.instances.clear()
  }

  static trigger(element: Element, height: number) {
    const entry = {
      target: element,
      contentRect: createRect(height),
    } as ResizeObserverEntry

    for (const observer of MockResizeObserver.instances) {
      if (!observer.elements.has(element)) {
        continue
      }

      observer.callback([entry], observer as unknown as ResizeObserver)
    }
  }
}

function AutoScrollHarness({ newContentDependencies, updatedContentDependencies = [], enabled = true }: HarnessProps) {
  const { scrollContainerRef, scrollContentRef, scrollEndRef, showScrollButton, scrollToBottom, handleScroll } =
    useAutoScroll({
      newContentDependencies,
      updatedContentDependencies,
      enabled,
    })

  return (
    <>
      <div data-testid="scroll-button-state">{showScrollButton ? 'shown' : 'hidden'}</div>
      <button data-testid="resume-smooth-scroll" onClick={() => scrollToBottom('smooth')}>
        Resume smooth scroll
      </button>
      <div data-testid="container" ref={scrollContainerRef} onScroll={handleScroll}>
        <div data-testid="content" ref={scrollContentRef}>
          <div data-testid="scroll-end" ref={scrollEndRef} />
        </div>
      </div>
    </>
  )
}

function installScrollMetrics(
  scrollContainer: HTMLDivElement,
  scrollContent: HTMLDivElement,
  scrollEnd: HTMLDivElement,
  metrics: ScrollMetrics,
  options: { sentinelScrollTop?: number } = {}
) {
  const clampScrollTop = (value: number) => Math.max(0, Math.min(value, metrics.scrollHeight - metrics.clientHeight))

  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  })

  Object.defineProperty(scrollContainer, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  })

  Object.defineProperty(scrollContainer, 'scrollTop', {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (value: number) => {
      metrics.scrollTop = clampScrollTop(value)
    },
  })

  Object.defineProperty(scrollContainer, 'scrollTo', {
    configurable: true,
    value: vi.fn(({ top }: { top: number }) => {
      metrics.scrollTop = clampScrollTop(top)
    }),
  })

  Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => createRect(metrics.clientHeight)),
  })

  Object.defineProperty(scrollContent, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => createRect(metrics.contentHeight)),
  })

  Object.defineProperty(scrollEnd, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(() => {
      metrics.scrollTop = clampScrollTop(options.sentinelScrollTop ?? metrics.scrollHeight - metrics.clientHeight)
    }),
  })
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let rafCallbacks = new Map<number, FrameRequestCallback>()
let nextAnimationFrameId = 1
let animationTimestamp = 0
let originalResizeObserver: typeof ResizeObserver | undefined
let originalRequestAnimationFrame: typeof requestAnimationFrame | undefined
let originalCancelAnimationFrame: typeof cancelAnimationFrame | undefined
let originalMatchMedia: typeof window.matchMedia | undefined

async function renderHarness(props: HarnessProps) {
  await act(async () => {
    root?.render(<AutoScrollHarness {...props} />)
  })
}

function getScrollElements() {
  const scrollContainer = document.querySelector('[data-testid="container"]') as HTMLDivElement | null
  const scrollContent = document.querySelector('[data-testid="content"]') as HTMLDivElement | null
  const scrollEnd = document.querySelector('[data-testid="scroll-end"]') as HTMLDivElement | null

  if (!scrollContainer || !scrollContent || !scrollEnd) {
    throw new Error('AutoScrollHarness elements missing')
  }

  return { scrollContainer, scrollContent, scrollEnd }
}

function getScrollButtonState() {
  return document.querySelector('[data-testid="scroll-button-state"]')?.textContent
}

function getResumeSmoothScrollButton() {
  const button = document.querySelector('[data-testid="resume-smooth-scroll"]') as HTMLButtonElement | null

  if (!button) {
    throw new Error('Resume smooth scroll button missing')
  }

  return button
}

type UserScrollIntent = 'wheel' | 'pointer' | 'touch'

function dispatchUserScrollIntent(scrollContainer: HTMLDivElement, intent: UserScrollIntent) {
  switch (intent) {
    case 'wheel':
      scrollContainer.dispatchEvent(new Event('wheel', { bubbles: true }))
      return
    case 'pointer':
      scrollContainer.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      return
    case 'touch':
      scrollContainer.dispatchEvent(new Event('touchmove', { bubbles: true }))
      return
  }
}

async function dispatchContainerScroll(scrollContainer: HTMLDivElement) {
  await act(async () => {
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}

async function dispatchUserScrollAway(
  scrollContainer: HTMLDivElement,
  metrics: ScrollMetrics,
  nextScrollTop: number,
  intent: UserScrollIntent = 'wheel'
) {
  await act(async () => {
    dispatchUserScrollIntent(scrollContainer, intent)
    metrics.scrollTop = nextScrollTop
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}

async function flushAnimationFrames(limit = 10) {
  await act(async () => {
    for (let count = 0; count < limit && rafCallbacks.size > 0; count += 1) {
      const callbacks = Array.from(rafCallbacks.values())
      rafCallbacks = new Map()
      animationTimestamp += 16

      for (const callback of callbacks) {
        callback(animationTimestamp)
      }
    }
  })
}

describe('useAutoScroll', () => {
  beforeEach(() => {
    MockResizeObserver.reset()
    rafCallbacks = new Map()
    nextAnimationFrameId = 1
    animationTimestamp = 0

    originalResizeObserver = globalThis.ResizeObserver
    originalRequestAnimationFrame = globalThis.requestAnimationFrame
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    originalMatchMedia = window.matchMedia

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const frameId = nextAnimationFrameId
      nextAnimationFrameId += 1
      rafCallbacks.set(frameId, callback)
      return frameId
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((frameId: number) => {
      rafCallbacks.delete(frameId)
    }) as typeof cancelAnimationFrame

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })

    MockResizeObserver.reset()
    document.body.innerHTML = ''
    root = null
    container = null

    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    }

    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    }

    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    }

    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia,
      })
    }
  })

  it('scrolls to the bottom on mount', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 280,
      contentHeight: 720,
      scrollHeight: 720,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(440)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('pins to the actual scroll container bottom instead of the end sentinel boundary', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 280,
      contentHeight: 720,
      scrollHeight: 720,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics, {
      sentinelScrollTop: 416,
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(440)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('scrolls to the bottom when enabled after deferred content mounts', async () => {
    await renderHarness({ newContentDependencies: [1], enabled: false })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 280,
      contentHeight: 720,
      scrollHeight: 720,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(0)

    await renderHarness({ newContentDependencies: [2], enabled: true })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(440)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('keeps following when new content grows the timeline', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 600,
      scrollHeight: 600,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(300)

    metrics.contentHeight = 840
    metrics.scrollHeight = 840

    await renderHarness({ newContentDependencies: [2] })

    await act(async () => {
      MockResizeObserver.trigger(elements.scrollContent, metrics.contentHeight)
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(540)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('does not disable auto-scroll when append triggers a scroll event before the next frame', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 600,
      scrollHeight: 600,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(300)

    metrics.contentHeight = 840
    metrics.scrollHeight = 840

    await renderHarness({ newContentDependencies: [2] })

    await dispatchContainerScroll(elements.scrollContainer)

    expect(getScrollButtonState()).toBe('hidden')

    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(540)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('does not disable auto-scroll when protected append scrolls upward before the next frame', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 600,
      scrollHeight: 600,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(300)

    metrics.contentHeight = 840
    metrics.scrollHeight = 840

    await renderHarness({ newContentDependencies: [2] })

    metrics.scrollTop = 260
    await dispatchContainerScroll(elements.scrollContainer)

    expect(getScrollButtonState()).toBe('hidden')

    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(540)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('keeps following when content grows in place after a no-intent scroll event', async () => {
    await renderHarness({ newContentDependencies: [1], updatedContentDependencies: [0] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 600,
      scrollHeight: 600,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(300)

    metrics.contentHeight = 840
    metrics.scrollHeight = 840
    metrics.scrollTop = 260

    await dispatchContainerScroll(elements.scrollContainer)

    expect(getScrollButtonState()).toBe('hidden')

    await act(async () => {
      MockResizeObserver.trigger(elements.scrollContent, metrics.contentHeight)
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(540)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('still lets the user interrupt auto-scroll before the next-frame append scroll runs', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 600,
      scrollHeight: 600,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(300)

    metrics.contentHeight = 840
    metrics.scrollHeight = 840

    await renderHarness({ newContentDependencies: [2] })

    await dispatchUserScrollAway(elements.scrollContainer, metrics, 220)

    expect(getScrollButtonState()).toBe('shown')

    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(220)
    expect(getScrollButtonState()).toBe('shown')
  })

  it.each(['wheel', 'pointer', 'touch'] as const)(
    'stops following after %s intent scrolls away from the bottom',
    async (intent) => {
      await renderHarness({ newContentDependencies: [1] })

      const elements = getScrollElements()
      const metrics: ScrollMetrics = {
        clientHeight: 320,
        contentHeight: 800,
        scrollHeight: 800,
        scrollTop: 0,
      }

      installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
      await flushAnimationFrames()

      await dispatchUserScrollAway(elements.scrollContainer, metrics, 180, intent)

      expect(getScrollButtonState()).toBe('shown')

      metrics.contentHeight = 920
      metrics.scrollHeight = 920

      await renderHarness({ newContentDependencies: [2] })

      await act(async () => {
        MockResizeObserver.trigger(elements.scrollContent, metrics.contentHeight)
      })
      await flushAnimationFrames()

      expect(metrics.scrollTop).toBe(180)
      expect(getScrollButtonState()).toBe('shown')
    }
  )

  it('resumes following after submit re-enables smooth auto-scroll', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 320,
      contentHeight: 800,
      scrollHeight: 800,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    await dispatchUserScrollAway(elements.scrollContainer, metrics, 180)

    expect(getScrollButtonState()).toBe('shown')

    await act(async () => {
      getResumeSmoothScrollButton().click()
    })

    expect(metrics.scrollTop).toBe(480)
    expect(getScrollButtonState()).toBe('hidden')

    metrics.contentHeight = 920
    metrics.scrollHeight = 920

    await renderHarness({ newContentDependencies: [2] })

    await act(async () => {
      MockResizeObserver.trigger(elements.scrollContent, metrics.contentHeight)
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(600)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('re-pins to the bottom when the scroll container height changes', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 900,
      scrollHeight: 900,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(600)

    metrics.clientHeight = 220

    await act(async () => {
      MockResizeObserver.trigger(elements.scrollContainer, metrics.clientHeight)
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(680)
    expect(getScrollButtonState()).toBe('hidden')
  })

  it('does not force the bottom back into view on resize after auto-scroll is disabled', async () => {
    await renderHarness({ newContentDependencies: [1] })

    const elements = getScrollElements()
    const metrics: ScrollMetrics = {
      clientHeight: 300,
      contentHeight: 900,
      scrollHeight: 900,
      scrollTop: 0,
    }

    installScrollMetrics(elements.scrollContainer, elements.scrollContent, elements.scrollEnd, metrics)
    await flushAnimationFrames()

    await dispatchUserScrollAway(elements.scrollContainer, metrics, 420)

    expect(getScrollButtonState()).toBe('shown')

    metrics.clientHeight = 240

    await act(async () => {
      MockResizeObserver.trigger(elements.scrollContainer, metrics.clientHeight)
    })
    await flushAnimationFrames()

    expect(metrics.scrollTop).toBe(420)
  })
})
