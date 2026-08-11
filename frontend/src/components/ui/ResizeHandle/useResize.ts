import { useState, useCallback, useEffect, useRef } from 'react'

type ResizeDirection = 'horizontal' | 'vertical'
type ResizePosition = 'left' | 'right' | 'top' | 'bottom'

interface UseResizeOptions {
  direction: ResizeDirection
  position: ResizePosition
  minSize: number
  maxSize: number | ((windowSize: number) => number)
  onResize: (size: number) => void
  /** Ratio of viewport to toggle to on double-click (e.g., 0.4 for 40%) */
  doubleClickToggleRatio?: number
  /** Default size to return to on double-click toggle */
  defaultSize?: number
  /** Current size, needed to detect toggle state */
  currentSize?: number
}

const DRAG_THRESHOLD = 3 // Minimum pixels to move before resize starts

export function useResize({
  direction,
  position,
  minSize,
  maxSize,
  onResize,
  doubleClickToggleRatio,
  defaultSize,
  currentSize,
}: UseResizeOptions) {
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)
  const currentSizeRef = useRef<number | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const hasDraggedRef = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    currentSizeRef.current = null
    startPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = false
    setIsResizing(true)
  }, [])

  const handleDoubleClick = useCallback(() => {
    if (!doubleClickToggleRatio || defaultSize === undefined || currentSize === undefined) return

    const windowSize = direction === 'horizontal' ? window.innerWidth : window.innerHeight
    const toggleSize = Math.round(windowSize * doubleClickToggleRatio)
    const computedMaxSize = typeof maxSize === 'function' ? maxSize(windowSize) : maxSize
    const constrainedToggleSize = Math.max(minSize, Math.min(computedMaxSize, toggleSize))

    // Toggle: if close to expanded size, go to default; otherwise go to expanded
    const isExpanded = Math.abs(currentSize - constrainedToggleSize) < 10
    if (isExpanded) {
      onResize(defaultSize)
    } else {
      onResize(constrainedToggleSize)
    }
  }, [doubleClickToggleRatio, defaultSize, currentSize, direction, maxSize, minSize, onResize])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return

      // Check if we've exceeded the drag threshold
      if (!hasDraggedRef.current && startPosRef.current) {
        const dx = Math.abs(e.clientX - startPosRef.current.x)
        const dy = Math.abs(e.clientY - startPosRef.current.y)
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
          return // Don't resize until threshold is exceeded
        }
        hasDraggedRef.current = true
      }

      let newSize: number
      let windowSize: number

      if (direction === 'horizontal') {
        windowSize = window.innerWidth
        if (position === 'left' || position === 'right') {
          newSize = position === 'right' ? e.clientX : windowSize - e.clientX
        } else {
          return
        }
      } else {
        windowSize = window.innerHeight
        if (position === 'top' || position === 'bottom') {
          if (!resizeRef.current?.parentElement) return
          const containerRect = resizeRef.current.parentElement.getBoundingClientRect()

          if (position === 'top') {
            newSize = containerRect.bottom - e.clientY
          } else {
            newSize = e.clientY - containerRect.top
          }
        } else {
          return
        }
      }

      const computedMaxSize = typeof maxSize === 'function' ? maxSize(windowSize) : maxSize
      const constrainedSize = Math.max(minSize, Math.min(computedMaxSize, newSize))

      // Store the current size for syncing on mouseup
      currentSizeRef.current = constrainedSize

      // Apply size directly to DOM during drag (no React re-render)
      const parentElement = resizeRef.current?.parentElement
      if (parentElement) {
        if (direction === 'horizontal') {
          parentElement.style.width = `${constrainedSize}px`
          // Also update CSS variable so other components can track during drag
          if (position === 'left') {
            document.documentElement.style.setProperty('--sidebar-width', `${constrainedSize}px`)
          }
        } else {
          parentElement.style.height = `${constrainedSize}px`
        }
      }
    },
    [isResizing, direction, position, minSize, maxSize]
  )

  const handleMouseUp = useCallback(() => {
    // Sync final size to React state (single re-render)
    if (currentSizeRef.current !== null) {
      onResize(currentSizeRef.current)
    }
    currentSizeRef.current = null
    startPosRef.current = null
    hasDraggedRef.current = false
    setIsResizing(false)
  }, [onResize])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizing, direction, handleMouseMove, handleMouseUp])

  return {
    isResizing,
    resizeRef,
    handleMouseDown,
    handleDoubleClick,
  }
}
