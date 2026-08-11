import { useMemo, useSyncExternalStore } from 'react'
import { useUI } from '@/store/useUIStore'

const TOP_OFFSET = 24
const MAX_DOCUMENT_WIDTH = 720

function subscribeToResize(callback: () => void) {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}

function getWindowHeight() {
  return window.innerHeight
}

/**
 * Hook to calculate responsive layout for focus mode overlay.
 * Returns max dimensions and sidebar offset for proper centering.
 */
export function useFocusModeLayout() {
  const { sidebarWidth, sidebarOpen, zenMode, fullScreenMode } = useUI()

  // Subscribe to window resize for height changes
  const windowHeight = useSyncExternalStore(subscribeToResize, getWindowHeight, getWindowHeight)

  return useMemo(() => {
    // Calculate right sidebar offset for centering
    // The overlay is inside the canvas container (between chat and workspace sidebar)
    // To center content visually in the full viewport, offset by half the sidebar width
    const isNormalMode = !zenMode && !fullScreenMode
    const rightSidebarOffset = sidebarOpen && isNormalMode ? sidebarWidth / 2 : 0

    return {
      documentWidth: MAX_DOCUMENT_WIDTH,
      topOffset: TOP_OFFSET,
      maxHeight: windowHeight - TOP_OFFSET * 2,
      rightSidebarOffset,
    }
  }, [windowHeight, sidebarWidth, sidebarOpen, zenMode, fullScreenMode])
}
