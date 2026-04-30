import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'

type AutoScrollDependency = string | number | boolean | null | undefined
type ScrollMode = 'smooth' | 'instant'
type GrowthScrollMode = ScrollMode | 'follow'

const USER_SCROLL_INTENT_WINDOW_MS = 800
const TOUCH_SCROLL_INTENT_DELTA_PX = 4
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

interface UseAutoScrollOptions {
  /** Dependencies that append a new timeline item */
  newContentDependencies: AutoScrollDependency[]
  /** Dependencies that grow an existing item in place */
  updatedContentDependencies?: AutoScrollDependency[]
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number
  /** Whether the scroll container is currently mounted and visible */
  enabled?: boolean
}

function serializeDependencies(dependencies: AutoScrollDependency[]) {
  return JSON.stringify(dependencies)
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference)
      return () => mediaQuery.removeEventListener('change', updatePreference)
    }

    mediaQuery.addListener(updatePreference)
    return () => mediaQuery.removeListener(updatePreference)
  }, [])

  return prefersReducedMotion
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function useAutoScroll({
  newContentDependencies,
  updatedContentDependencies = [],
  threshold = 50,
  enabled = true,
}: UseAutoScrollOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const newContentKey = serializeDependencies(newContentDependencies)
  const updatedContentKey = serializeDependencies(updatedContentDependencies)
  const previousNewContentKeyRef = useRef<string | null>(null)
  const previousUpdatedContentKeyRef = useRef<string | null>(null)
  const wasEnabledRef = useRef(false)
  const autoScrollRef = useRef(autoScroll)
  const enabledRef = useRef(enabled)
  const pendingContentGrowthModeRef = useRef<GrowthScrollMode | null>(null)
  const programmaticScrollModeRef = useRef<GrowthScrollMode | null>(null)
  const lastObservedHeightRef = useRef(0)
  const lastObservedContainerHeightRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const scrollFrameRef = useRef<number | null>(null)
  const scheduledScrollModeRef = useRef<ScrollMode | null>(null)
  const followFrameRef = useRef<number | null>(null)
  const followKeepAliveUntilRef = useRef(0)
  const followLastTimestampRef = useRef<number | null>(null)
  const userScrollIntentUntilRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    autoScrollRef.current = autoScroll
  }, [autoScroll])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const recordUserScrollIntent = useCallback(() => {
    userScrollIntentUntilRef.current = now() + USER_SCROLL_INTENT_WINDOW_MS
  }, [])

  const hasRecentUserScrollIntent = useCallback(() => {
    return userScrollIntentUntilRef.current >= now()
  }, [])

  const cancelScheduledScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
    scheduledScrollModeRef.current = null
  }, [])

  const cancelFollowLoop = useCallback(() => {
    if (followFrameRef.current !== null) {
      cancelAnimationFrame(followFrameRef.current)
      followFrameRef.current = null
    }

    followKeepAliveUntilRef.current = 0
    followLastTimestampRef.current = null

    if (programmaticScrollModeRef.current === 'follow') {
      programmaticScrollModeRef.current = null
    }
  }, [])

  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [threshold])

  const scrollToBottom = useCallback(
    (mode: ScrollMode = 'smooth') => {
      const container = scrollContainerRef.current
      if (!container) return

      cancelFollowLoop()
      pendingContentGrowthModeRef.current = null
      userScrollIntentUntilRef.current = 0
      touchStartRef.current = null

      const top = container.scrollHeight
      const shouldSmooth = mode === 'smooth' && !prefersReducedMotion

      programmaticScrollModeRef.current = shouldSmooth ? 'smooth' : null

      if (shouldSmooth) {
        container.scrollTo({ top, behavior: 'smooth' })
      } else {
        container.scrollTop = top
      }

      lastScrollTopRef.current = container.scrollTop
      autoScrollRef.current = true
      setAutoScroll(true)
      setShowScrollButton(false)
    },
    [cancelFollowLoop, prefersReducedMotion]
  )

  const scheduleScrollToBottom = useCallback(
    (mode: ScrollMode) => {
      const nextMode = scheduledScrollModeRef.current === 'smooth' || mode === 'smooth' ? 'smooth' : 'instant'

      scheduledScrollModeRef.current = nextMode

      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }

      scrollFrameRef.current = requestAnimationFrame(() => {
        const scheduledMode = scheduledScrollModeRef.current ?? mode
        scrollFrameRef.current = null
        scheduledScrollModeRef.current = null
        scrollToBottom(scheduledMode)
      })
    },
    [scrollToBottom]
  )

  const startFollowLoop = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    if (prefersReducedMotion) {
      scrollToBottom('instant')
      return
    }

    followKeepAliveUntilRef.current = now() + 180

    if (followFrameRef.current !== null) {
      return
    }

    setAutoScroll(true)
    autoScrollRef.current = true
    setShowScrollButton(false)
    programmaticScrollModeRef.current = 'follow'
    followLastTimestampRef.current = null

    const step = (timestamp: number) => {
      const currentContainer = scrollContainerRef.current

      if (!currentContainer || !enabledRef.current || !autoScrollRef.current) {
        cancelFollowLoop()
        return
      }

      const target = Math.max(currentContainer.scrollHeight - currentContainer.clientHeight, 0)
      const currentScrollTop = currentContainer.scrollTop
      const distanceToBottom = target - currentScrollTop

      if (distanceToBottom <= 0.5) {
        if (Math.abs(distanceToBottom) > 0) {
          currentContainer.scrollTop = target
        }

        lastScrollTopRef.current = currentContainer.scrollTop

        if (timestamp >= followKeepAliveUntilRef.current) {
          cancelFollowLoop()
          return
        }

        programmaticScrollModeRef.current = 'follow'
        followLastTimestampRef.current = timestamp
        followFrameRef.current = requestAnimationFrame(step)
        return
      }

      const previousTimestamp = followLastTimestampRef.current ?? timestamp - 16
      const deltaTime = Math.min(timestamp - previousTimestamp, 48)
      followLastTimestampRef.current = timestamp

      const nextStep = Math.min(
        distanceToBottom,
        Math.max(1.5, Math.min(distanceToBottom * 0.22 * (deltaTime / 16), 72))
      )

      programmaticScrollModeRef.current = 'follow'
      currentContainer.scrollTop = currentScrollTop + nextStep
      lastScrollTopRef.current = currentContainer.scrollTop
      followFrameRef.current = requestAnimationFrame(step)
    }

    followFrameRef.current = requestAnimationFrame(step)
  }, [cancelFollowLoop, prefersReducedMotion, scrollToBottom])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    lastScrollTopRef.current = currentScrollTop

    const nearBottom = isNearBottom()

    if (nearBottom) {
      if (programmaticScrollModeRef.current !== 'follow') {
        programmaticScrollModeRef.current = null
      }
      userScrollIntentUntilRef.current = 0
      touchStartRef.current = null
      autoScrollRef.current = true
      setAutoScroll(true)
      setShowScrollButton(false)
    } else {
      if (!hasRecentUserScrollIntent()) {
        return
      }

      programmaticScrollModeRef.current = null
      pendingContentGrowthModeRef.current = null
      cancelScheduledScroll()
      cancelFollowLoop()
      autoScrollRef.current = false
      setAutoScroll(false)
      setShowScrollButton(true)
    }
  }, [cancelFollowLoop, cancelScheduledScroll, hasRecentUserScrollIntent, isNearBottom])

  useEffect(() => {
    return () => {
      cancelScheduledScroll()
      cancelFollowLoop()
    }
  }, [cancelFollowLoop, cancelScheduledScroll])

  useEffect(() => {
    if (!enabled) {
      userScrollIntentUntilRef.current = 0
      touchStartRef.current = null
      return
    }

    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const passiveListenerOptions: AddEventListenerOptions = { passive: true }
    const handleWheel = () => recordUserScrollIntent()
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target === container) {
        recordUserScrollIntent()
      }
    }
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches?.[0]
      touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    }
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches?.[0]
      const touchStart = touchStartRef.current

      if (!touch || !touchStart) {
        recordUserScrollIntent()
        return
      }

      const deltaX = Math.abs(touch.clientX - touchStart.x)
      const deltaY = Math.abs(touch.clientY - touchStart.y)

      if (deltaX > TOUCH_SCROLL_INTENT_DELTA_PX || deltaY > TOUCH_SCROLL_INTENT_DELTA_PX) {
        recordUserScrollIntent()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !SCROLL_KEYS.has(event.key)) {
        return
      }

      const activeElement = document.activeElement
      if (activeElement && container.contains(activeElement)) {
        recordUserScrollIntent()
      }
    }

    container.addEventListener('wheel', handleWheel, passiveListenerOptions)
    container.addEventListener('pointerdown', handlePointerDown, passiveListenerOptions)
    container.addEventListener('touchstart', handleTouchStart, passiveListenerOptions)
    container.addEventListener('touchmove', handleTouchMove, passiveListenerOptions)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('pointerdown', handlePointerDown)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, recordUserScrollIntent])

  useLayoutEffect(() => {
    const previousNewContentKey = previousNewContentKeyRef.current
    const previousUpdatedContentKey = previousUpdatedContentKeyRef.current
    const wasEnabled = wasEnabledRef.current

    previousNewContentKeyRef.current = newContentKey
    previousUpdatedContentKeyRef.current = updatedContentKey
    wasEnabledRef.current = enabled

    if (!enabled) {
      programmaticScrollModeRef.current = null
      pendingContentGrowthModeRef.current = null
      cancelScheduledScroll()
      cancelFollowLoop()
      return
    }

    if (!wasEnabled) {
      scheduleScrollToBottom('instant')
      return
    }

    if (!autoScroll) {
      pendingContentGrowthModeRef.current = null
      return
    }

    const hasNewContent = previousNewContentKey !== null && previousNewContentKey !== newContentKey
    const hasUpdatedContent = previousUpdatedContentKey !== null && previousUpdatedContentKey !== updatedContentKey

    if (!hasNewContent && !hasUpdatedContent) {
      return
    }

    if (hasNewContent && typeof ResizeObserver !== 'undefined') {
      scheduleScrollToBottom('smooth')
      pendingContentGrowthModeRef.current = prefersReducedMotion ? 'instant' : 'follow'
      return
    }

    pendingContentGrowthModeRef.current = hasNewContent ? 'smooth' : prefersReducedMotion ? 'instant' : 'follow'

    if (typeof ResizeObserver === 'undefined') {
      const mode = pendingContentGrowthModeRef.current
      if (mode) {
        if (mode === 'follow') {
          startFollowLoop()
        } else {
          scheduleScrollToBottom(mode)
        }
      }
      pendingContentGrowthModeRef.current = null
    }
  }, [
    newContentKey,
    updatedContentKey,
    enabled,
    autoScroll,
    prefersReducedMotion,
    startFollowLoop,
    scheduleScrollToBottom,
    cancelFollowLoop,
    cancelScheduledScroll,
  ])

  useEffect(() => {
    if (!enabled) {
      lastObservedHeightRef.current = 0
      return
    }

    const content = scrollContentRef.current
    if (!content) {
      lastObservedHeightRef.current = 0
      return
    }

    lastObservedHeightRef.current = content.getBoundingClientRect().height

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const nextHeight = entry.contentRect.height
      const previousHeight = lastObservedHeightRef.current
      lastObservedHeightRef.current = nextHeight

      if (nextHeight <= previousHeight || !autoScrollRef.current) {
        return
      }

      const mode = pendingContentGrowthModeRef.current ?? (prefersReducedMotion ? 'instant' : 'follow')
      pendingContentGrowthModeRef.current = null
      if (mode === 'follow') {
        startFollowLoop()
      } else {
        scheduleScrollToBottom(mode)
      }
    })

    observer.observe(content)

    return () => observer.disconnect()
  }, [enabled, prefersReducedMotion, scheduleScrollToBottom, startFollowLoop])

  useEffect(() => {
    if (!enabled) {
      lastObservedContainerHeightRef.current = 0
      return
    }

    const container = scrollContainerRef.current
    if (!container) {
      lastObservedContainerHeightRef.current = 0
      return
    }

    lastObservedContainerHeightRef.current = container.getBoundingClientRect().height

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const nextHeight = entry.contentRect.height
      const previousHeight = lastObservedContainerHeightRef.current
      lastObservedContainerHeightRef.current = nextHeight

      if (nextHeight === previousHeight || !autoScrollRef.current) {
        return
      }

      scheduleScrollToBottom('instant')
    })

    observer.observe(container)

    return () => observer.disconnect()
  }, [enabled, scheduleScrollToBottom])

  return {
    scrollContainerRef,
    scrollContentRef,
    scrollEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
  }
}
