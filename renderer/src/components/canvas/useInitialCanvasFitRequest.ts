import { useEffect, useRef } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { CanvasItem, NodeItem } from 'shared'
import { getCanvasViewport } from '@/hooks/workspaceStorage'
import { calculateCanvasFitViewport, collectCanvasItemBounds, collectRenderedNodeBounds } from './canvasFitView'
import { CANVAS } from './constants'
import { useVisibleCanvasArea } from './useVisibleCanvasArea'

const FIRST_OPEN_FIT_DELAY_MS = 70
const FIT_VIEW_REVEAL_FRAME_COUNT = 2

interface UseInitialCanvasFitRequestOptions {
  workspaceId: string
  canvasId: string
  canvasItems: Array<CanvasItem | NodeItem>
  renderedNodeIds: string[]
  fitCanvasRequestKey?: string | null
  getNode: ReactFlowInstance['getNode']
  setViewport: ReactFlowInstance['setViewport']
  onFitCanvasRequestHandled?: (requestKey: string) => void
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

export function useInitialCanvasFitRequest({
  workspaceId,
  canvasId,
  canvasItems,
  renderedNodeIds,
  fitCanvasRequestKey,
  getNode,
  setViewport,
  onFitCanvasRequestHandled,
}: UseInitialCanvasFitRequestOptions) {
  const visibleArea = useVisibleCanvasArea()
  const canvasItemsRef = useRef(canvasItems)
  const renderedNodeIdsRef = useRef(renderedNodeIds)
  canvasItemsRef.current = canvasItems
  renderedNodeIdsRef.current = renderedNodeIds

  useEffect(() => {
    if (!fitCanvasRequestKey) {
      return
    }

    const savedCanvasViewport = getCanvasViewport(workspaceId, canvasId)
    if (savedCanvasViewport || canvasItemsRef.current.length === 0) {
      onFitCanvasRequestHandled?.(fitCanvasRequestKey)
      return
    }

    let cancelled = false
    let frameId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const revealFitCanvas = () => {
      const scheduleNextRevealFrame = (remainingFrames: number) => {
        if (cancelled) {
          return
        }

        frameId = requestAnimationFrame(() => {
          if (cancelled) {
            return
          }

          if (remainingFrames <= 1) {
            onFitCanvasRequestHandled?.(fitCanvasRequestKey)
            return
          }

          scheduleNextRevealFrame(remainingFrames - 1)
        })
      }

      scheduleNextRevealFrame(FIT_VIEW_REVEAL_FRAME_COUNT)
    }

    const fitCanvas = () => {
      if (cancelled) {
        return
      }

      const currentItems = canvasItemsRef.current
      const canvasItemIds = new Set(currentItems.map((item) => item.id))
      const extraRenderedNodeIds = renderedNodeIdsRef.current.filter((nodeId) => !canvasItemIds.has(nodeId))
      const getRenderedNode = (nodeId: string) => getNode(nodeId) ?? null
      const bounds = [
        ...collectCanvasItemBounds(currentItems, getRenderedNode),
        ...collectRenderedNodeBounds(extraRenderedNodeIds, getRenderedNode),
      ]
      const roomyFitViewport = calculateCanvasFitViewport(bounds, visibleArea, {
        maxZoom: CANVAS.FIRST_OPEN_FIT_SMALL_CONTENT_MAX_ZOOM,
      })
      if (!roomyFitViewport) {
        onFitCanvasRequestHandled?.(fitCanvasRequestKey)
        return
      }
      const fitViewport =
        roomyFitViewport.zoom >= CANVAS.FIRST_OPEN_FIT_SMALL_CONTENT_MAX_ZOOM
          ? roomyFitViewport
          : (calculateCanvasFitViewport(bounds, visibleArea, {
              padding: CANVAS.FIRST_OPEN_FIT_COMPACT_PADDING,
            }) ?? roomyFitViewport)

      const viewportResult = setViewport(fitViewport, { duration: 0 })
      if (isPromiseLike(viewportResult)) {
        void viewportResult.then(revealFitCanvas, revealFitCanvas)
      } else {
        revealFitCanvas()
      }
    }

    timeoutId = setTimeout(() => {
      if (cancelled) {
        return
      }

      frameId = requestAnimationFrame(fitCanvas)
    }, FIRST_OPEN_FIT_DELAY_MS)

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [canvasId, fitCanvasRequestKey, getNode, onFitCanvasRequestHandled, setViewport, visibleArea, workspaceId])
}
