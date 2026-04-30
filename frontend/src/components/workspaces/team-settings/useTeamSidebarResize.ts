import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

const TEAM_SIDEBAR_DEFAULT_WIDTH_PX = 180
const TEAM_SIDEBAR_MIN_WIDTH_PX = 160
const TEAM_SIDEBAR_MAX_WIDTH_PX = 280
const TEAM_SIDEBAR_MAX_WIDTH_RATIO = 0.4

type ResizeStart = {
  pointerX: number
  width: number
}

interface UseTeamSidebarResizeOptions {
  isOpen: boolean
  containerRef: RefObject<HTMLDivElement | null>
}

export function useTeamSidebarResize({ isOpen, containerRef }: UseTeamSidebarResizeOptions) {
  const [teamSidebarWidth, setTeamSidebarWidth] = useState(TEAM_SIDEBAR_DEFAULT_WIDTH_PX)
  const [isTeamSidebarResizing, setIsTeamSidebarResizing] = useState(false)
  const resizeStartRef = useRef<ResizeStart | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingWidthRef = useRef<number | null>(null)

  const getMaxWidth = useCallback(() => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width
    if (!containerWidth || Number.isNaN(containerWidth)) {
      return TEAM_SIDEBAR_MAX_WIDTH_PX
    }

    return Math.max(
      TEAM_SIDEBAR_MIN_WIDTH_PX,
      Math.min(TEAM_SIDEBAR_MAX_WIDTH_PX, Math.floor(containerWidth * TEAM_SIDEBAR_MAX_WIDTH_RATIO))
    )
  }, [containerRef])

  const clampWidth = useCallback(
    (width: number) => Math.min(getMaxWidth(), Math.max(TEAM_SIDEBAR_MIN_WIDTH_PX, width)),
    [getMaxWidth]
  )

  const stopResizing = useCallback(() => {
    if (resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current)
    }

    const pendingWidth = pendingWidthRef.current
    if (typeof pendingWidth === 'number') {
      setTeamSidebarWidth(clampWidth(pendingWidth))
    }

    resizeRafRef.current = null
    pendingWidthRef.current = null
    resizeStartRef.current = null
    setIsTeamSidebarResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [clampWidth])

  useEffect(() => {
    if (!isTeamSidebarResizing) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const resizeStart = resizeStartRef.current
      if (!resizeStart) {
        return
      }

      pendingWidthRef.current = clampWidth(resizeStart.width + (event.clientX - resizeStart.pointerX))

      if (resizeRafRef.current !== null) {
        return
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null
        const nextPendingWidth = pendingWidthRef.current
        if (typeof nextPendingWidth === 'number') {
          setTeamSidebarWidth(nextPendingWidth)
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
  }, [clampWidth, isTeamSidebarResizing, stopResizing])

  useEffect(() => {
    if (isOpen) {
      return
    }

    stopResizing()
  }, [isOpen, stopResizing])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const syncWidthToContainer = () => {
      setTeamSidebarWidth((currentWidth) => clampWidth(currentWidth))
    }

    syncWidthToContainer()
    window.addEventListener('resize', syncWidthToContainer)

    return () => {
      window.removeEventListener('resize', syncWidthToContainer)
    }
  }, [clampWidth, isOpen])

  const handleTeamSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      resizeStartRef.current = {
        pointerX: event.clientX,
        width: teamSidebarWidth,
      }
      setIsTeamSidebarResizing(true)
    },
    [teamSidebarWidth]
  )

  return {
    teamSidebarWidth,
    isTeamSidebarResizing,
    handleTeamSidebarResizeStart,
  }
}
