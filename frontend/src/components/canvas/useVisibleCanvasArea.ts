import { useMemo } from 'react'
import { useUI } from '@/store/useUIStore'

export const useVisibleCanvasArea = () => {
  const { sidebarWidth, sidebarOpen, chatWidth, zenMode, fullScreenMode } = useUI()

  return useMemo(() => {
    const isNormalMode = !zenMode && !fullScreenMode
    const leftOffset = isNormalMode ? chatWidth : 0
    const rightOffset = sidebarOpen && isNormalMode ? sidebarWidth : 0
    const availableWidth = window.innerWidth - leftOffset - rightOffset
    const availableHeight = window.innerHeight

    return {
      leftOffset,
      rightOffset,
      availableWidth,
      availableHeight,
      centerX: availableWidth / 2,
      centerY: availableHeight / 2,
    }
  }, [sidebarWidth, sidebarOpen, chatWidth, zenMode, fullScreenMode])
}
