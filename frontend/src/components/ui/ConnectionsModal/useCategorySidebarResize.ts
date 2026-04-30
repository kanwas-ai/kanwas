import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

const CATEGORY_SIDEBAR_DEFAULT_WIDTH_PX = 256
const CATEGORY_SIDEBAR_MIN_WIDTH_PX = 208
const CATEGORY_SIDEBAR_MAX_WIDTH_PX = 420

type ResizeStart = {
  pointerX: number
  width: number
}

interface UseCategorySidebarResizeOptions {
  isOpen: boolean
}

export function useCategorySidebarResize({ isOpen }: UseCategorySidebarResizeOptions) {
  const [categorySidebarWidth, setCategorySidebarWidth] = useState(CATEGORY_SIDEBAR_DEFAULT_WIDTH_PX)
  const [isCategorySidebarResizing, setIsCategorySidebarResizing] = useState(false)
  const resizeStartRef = useRef<ResizeStart | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingWidthRef = useRef<number | null>(null)

  const stopResizing = useCallback(() => {
    if (resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current)
    }

    const pendingWidth = pendingWidthRef.current
    if (typeof pendingWidth === 'number') {
      setCategorySidebarWidth(pendingWidth)
    }

    resizeRafRef.current = null
    pendingWidthRef.current = null
    resizeStartRef.current = null
    setIsCategorySidebarResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (!isCategorySidebarResizing) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const resizeStart = resizeStartRef.current
      if (!resizeStart) {
        return
      }

      const deltaX = event.clientX - resizeStart.pointerX
      const nextWidth = Math.min(
        CATEGORY_SIDEBAR_MAX_WIDTH_PX,
        Math.max(CATEGORY_SIDEBAR_MIN_WIDTH_PX, resizeStart.width + deltaX)
      )

      pendingWidthRef.current = nextWidth

      if (resizeRafRef.current !== null) {
        return
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null
        const nextPendingWidth = pendingWidthRef.current
        if (typeof nextPendingWidth === 'number') {
          setCategorySidebarWidth(nextPendingWidth)
        }
      })
    }

    const handleMouseUp = () => {
      stopResizing()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current)
      }

      resizeRafRef.current = null
      pendingWidthRef.current = null
      resizeStartRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isCategorySidebarResizing, stopResizing])

  useEffect(() => {
    if (isOpen) {
      return
    }

    stopResizing()
  }, [isOpen, stopResizing])

  const handleCategorySidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      resizeStartRef.current = {
        pointerX: event.clientX,
        width: categorySidebarWidth,
      }
      setIsCategorySidebarResizing(true)
    },
    [categorySidebarWidth]
  )

  return {
    categorySidebarWidth,
    isCategorySidebarResizing,
    handleCategorySidebarResizeStart,
  }
}
