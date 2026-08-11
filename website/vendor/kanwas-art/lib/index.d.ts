export declare const KNOB_DEFAULTS: Record<string, number>

export declare class KanwasRenderer {
  constructor(
    canvas: HTMLCanvasElement,
    config?: {
      knobs?: Record<string, number>
      time?: number
      animate?: boolean
      targetFps?: number
      minScale?: number
      maxPixelRatio?: number
      onTierChange?: (tier: 'animated' | 'static') => void
    }
  )
  start(): boolean
  stop(): void
  resume(): void
  destroy(): void
  setKnobs(knobs: Record<string, number>): void
  setTime(t: number): void
  resize(): void
  draw(): void
  readonly tier: 'animated' | 'static'
  readonly qualityScale: number
}
