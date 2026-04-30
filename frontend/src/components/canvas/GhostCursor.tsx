import { forwardRef } from 'react'

interface GhostCursorProps {
  visible: boolean
}

export const GhostCursor = forwardRef<HTMLDivElement, GhostCursorProps>(function GhostCursor({ visible }, ref) {
  if (!visible) return null

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-[60]"
      style={{ transform: 'translate(-100px, -100px)', filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22))' }}
    >
      <svg width="28" height="28" viewBox="0 0 30 30">
        <path
          d="M3.77 2.93 L21.23 12.07 Q23 13 21.08 13.57 L14.92 15.43 Q13 16 12.19 17.83 L9.81 23.17 Q9 25 8.42 23.09 L2.58 3.91 Q2 2 3.77 2.93 Z"
          fill="#E8A300"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
})
