import { useReactFlow } from '@xyflow/react'
import type { SwapIndicator } from './useCanvasLayout'

interface SnapGuidesProps {
  swapIndicator: SwapIndicator | null
}

/**
 * Renders the swap indicator during node dragging.
 * Placed as a child of ReactFlow, which renders it in viewport space.
 */
export function SnapGuides({ swapIndicator }: SnapGuidesProps) {
  const { getViewport } = useReactFlow()
  const { x: vx, y: vy, zoom } = getViewport()

  if (!swapIndicator) return null

  return (
    <>
      {/* Target node highlight */}
      <div
        style={{
          position: 'absolute',
          left: swapIndicator.targetX * zoom + vx,
          top: swapIndicator.targetY * zoom + vy,
          width: swapIndicator.targetWidth * zoom,
          height: swapIndicator.targetHeight * zoom,
          borderRadius: 8,
          border: '1.5px solid rgba(0, 0, 0, 0.25)',
          pointerEvents: 'none',
          zIndex: 999,
        }}
      />
      {/* Swap label */}
      <div
        style={{
          position: 'absolute',
          left: swapIndicator.x * zoom + vx,
          top: swapIndicator.y * zoom + vy - 10,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            background: 'black',
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 6,
            opacity: 0.75,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <i className="fa-solid fa-arrow-right-arrow-left" style={{ fontSize: 10 }} />
          Swap
        </div>
      </div>
    </>
  )
}
