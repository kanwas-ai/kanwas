import { type JSX } from 'react'

export interface KanwasArtConfig {
  knobs?: Record<string, number>
  time?: number
  animate?: boolean
  targetFps?: number
  minScale?: number
  maxPixelRatio?: number
}

export interface KanwasCanvasProps {
  config: KanwasArtConfig
  className?: string
  style?: React.CSSProperties
  onTierChange?: (tier: 'animated' | 'static') => void
}

export function KanwasCanvas(props: KanwasCanvasProps): JSX.Element
