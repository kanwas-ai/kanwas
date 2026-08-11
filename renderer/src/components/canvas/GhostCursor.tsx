import { forwardRef } from 'react'

interface GhostCursorProps {
  visible: boolean
}

export const GhostCursor = forwardRef<HTMLDivElement, GhostCursorProps>(function GhostCursor({ visible }, ref) {
  if (!visible) return null

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-[60] flex items-end gap-1.5"
      style={{ transform: 'translate(-100px, -100px)' }}
    >
      <svg width="28" height="28" viewBox="0 0 30 30" style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22))' }}>
        <path
          d="M3.77 2.93 L21.23 12.07 Q23 13 21.08 13.57 L14.92 15.43 Q13 16 12.19 17.83 L9.81 23.17 Q9 25 8.42 23.09 L2.58 3.91 Q2 2 3.77 2.93 Z"
          fill="#E8A300"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="text-foreground font-medium rounded-md px-1.5 py-0.5"
        style={{
          fontSize: '11px',
          lineHeight: '16px',
          background: 'rgba(253, 252, 249, 0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: 'inset 0 0 0 0.5px #E7DCCA, 0 2px 6px rgba(60, 45, 20, 0.12)',
          marginBottom: '4px',
        }}
      >
        Click to place
      </span>
    </div>
  )
})
