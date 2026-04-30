import { useStore } from '@xyflow/react'
import type { CSSProperties } from 'react'

const ACTIVE_WRITE_PULSE_MIN_SCALE = 0.8
const ACTIVE_WRITE_PULSE_MAX_SCALE = 2.4
const ACTIVE_WRITE_PULSE_BASE_BORDER_WIDTH_PX = 1.4
const ACTIVE_WRITE_PULSE_BASE_RING_SPREAD_PX = 2
const ACTIVE_WRITE_PULSE_BASE_GLOW_BLUR_PX = 12
const ACTIVE_WRITE_PULSE_BASE_GLOW_SPREAD_PX = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function NodeActivityPulse({ active }: { active: boolean }) {
  const zoom = useStore((state) => state.transform[2])
  const scale = clamp(1 / Math.max(zoom, 0.01), ACTIVE_WRITE_PULSE_MIN_SCALE, ACTIVE_WRITE_PULSE_MAX_SCALE)
  const style = {
    '--node-write-pulse-border-width': `${(ACTIVE_WRITE_PULSE_BASE_BORDER_WIDTH_PX * scale).toFixed(2)}px`,
    '--node-write-pulse-ring-spread': `${(ACTIVE_WRITE_PULSE_BASE_RING_SPREAD_PX * scale).toFixed(2)}px`,
    '--node-write-pulse-glow-blur': `${(ACTIVE_WRITE_PULSE_BASE_GLOW_BLUR_PX * scale).toFixed(2)}px`,
    '--node-write-pulse-glow-spread': `${(ACTIVE_WRITE_PULSE_BASE_GLOW_SPREAD_PX * scale).toFixed(2)}px`,
  } as CSSProperties

  return (
    <div
      aria-hidden="true"
      className={`node-card-active-write-overlay ${active ? 'node-card-active-write-overlay-active' : ''}`}
      style={style}
    >
      <div className="node-card-active-write-overlay-inner" />
    </div>
  )
}
