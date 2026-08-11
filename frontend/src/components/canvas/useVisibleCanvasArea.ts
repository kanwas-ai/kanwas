import { useMemo } from 'react'
import { useUI } from '@/store/useUIStore'

export const useVisibleCanvasArea = () => {
  const { sidebarWidth, sidebarOpen, zenMode, fullScreenMode } = useUI()

  return useMemo(() => {
    const isNormalMode = !zenMode && !fullScreenMode
    const rightOffset = sidebarOpen && isNormalMode ? sidebarWidth : 0
    const availableWidth = window.innerWidth - rightOffset
    const availableHeight = window.innerHeight

    return {
      rightOffset,
      availableWidth,
      availableHeight,
      centerX: availableWidth / 2,
      centerY: availableHeight / 2,
    }
  }, [sidebarWidth, sidebarOpen, zenMode, fullScreenMode])
}
