import { useEffect, useRef, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'

const EDGE_ZONE = 60 // px from viewport edge to start panning
const PAN_SPEED = 15 // px per frame at maximum intensity

/**
 * Auto-pans the ReactFlow viewport when the user drags a text selection
 * near the edge of the viewport. This restores the native-feeling behavior
 * of scrolling while selecting text, which ReactFlow doesn't support because
 * it uses CSS transforms instead of real scroll.
 */
export function useSelectionAutoPan(containerRef: React.RefObject<HTMLDivElement | null>) {
  const { getViewport, setViewport } = useReactFlow()
  const rafRef = useRef<number>(0)
  const panDelta = useRef({ x: 0, y: 0 })
  const isSelectingText = useRef(false)

  const panLoop = useCallback(() => {
    const { x: dx, y: dy } = panDelta.current
    if ((dx !== 0 || dy !== 0) && isSelectingText.current) {
      const vp = getViewport()
      setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 0 })
      rafRef.current = requestAnimationFrame(panLoop)
    } else {
      rafRef.current = 0
    }
  }, [getViewport, setViewport])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerDown = (e: PointerEvent) => {
      // Only care about left-click inside a nodrag element (text editors)
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (!target.closest('.nodrag')) return
      isSelectingText.current = true
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isSelectingText.current) return

      const rect = container.getBoundingClientRect()
      let dx = 0
      let dy = 0

      if (e.clientY < rect.top + EDGE_ZONE) {
        dy = PAN_SPEED * ((rect.top + EDGE_ZONE - e.clientY) / EDGE_ZONE)
      } else if (e.clientY > rect.bottom - EDGE_ZONE) {
        dy = -PAN_SPEED * ((e.clientY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE)
      }

      if (e.clientX < rect.left + EDGE_ZONE) {
        dx = PAN_SPEED * ((rect.left + EDGE_ZONE - e.clientX) / EDGE_ZONE)
      } else if (e.clientX > rect.right - EDGE_ZONE) {
        dx = -PAN_SPEED * ((e.clientX - (rect.right - EDGE_ZONE)) / EDGE_ZONE)
      }

      panDelta.current = { x: dx, y: dy }

      if ((dx !== 0 || dy !== 0) && !rafRef.current) {
        rafRef.current = requestAnimationFrame(panLoop)
      }
    }

    const handlePointerUp = () => {
      isSelectingText.current = false
      panDelta.current = { x: 0, y: 0 }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }

    container.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [containerRef, panLoop])
}
