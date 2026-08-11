// Sticky note text auto-fit: shrinks/grows the BlockNote editor's font size so content
// fits the note's body without overflowing, and scales up as the note is resized wider.
// This is purely presentational/derived state — it must NEVER live in node data or Valtio
// (see "Canvas Performance" in renderer/CLAUDE.md: don't add frequently-changing values to
// node data). The result is written directly onto the wrapper element's style as a CSS
// custom property (`--sticky-font-size`), consumed by `.sticky-note-editor` rules in
// index.css. No React state updates happen per measurement frame.
import { useEffect, useRef } from 'react'

export const STICKY_MIN_FONT = 14
// Mirrors the sticky body's CSS padding ('28px 12px 12px' in StickyNoteNode.tsx) — the
// vertical padding a note's minHeight budget loses before content has room to render.
export const STICKY_BODY_VERTICAL_PADDING = 28 + 12
const STICKY_BASE_WIDTH = 240
const STICKY_BASE_FONT = 32
const STICKY_MAX_FONT_FLOOR = 16
const STICKY_MAX_FONT_CEILING = 96

const MAX_CONVERGE_ITERATIONS = 6
// Below this ratio (available/content) the font is considered overflowing and must shrink.
const OVERFLOW_RATIO = 1
// Above this ratio there's enough slack to justify growing the font. Keeping it above 1
// (rather than exactly 1) avoids oscillating right at the fit boundary.
const GROW_SLACK_RATIO = 1.15

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Largest font a sticky note of `nodeWidth` should ever render at, before any shrink-to-fit. */
export function computeMaxStickyFont(nodeWidth: number): number {
  return clamp(
    Math.round((STICKY_BASE_FONT * nodeWidth) / STICKY_BASE_WIDTH),
    STICKY_MAX_FONT_FLOOR,
    STICKY_MAX_FONT_CEILING
  )
}

export interface NextStickyFontSizeInput {
  contentHeight: number
  availableHeight: number
  currentFont: number
  minFont: number
  maxFont: number
}

/**
 * Pure decision step for the auto-fit convergence loop: given a measurement of content vs.
 * available height at the current font, returns the next font to try.
 *
 * - Overflowing (content taller than available): shrink, damped by sqrt(ratio) so the step
 *   doesn't overshoot on the way down, and always move at least 1px so we don't stall.
 * - Fits with generous slack: grow the same damped way.
 * - Fits snugly (within the slack tolerance): stable — returns currentFont unchanged.
 * - Degenerate measurements (zero/negative) clamp currentFont into range and stop.
 */
export function nextStickyFontSize({
  contentHeight,
  availableHeight,
  currentFont,
  minFont,
  maxFont,
}: NextStickyFontSizeInput): number {
  if (!(contentHeight > 0) || !(availableHeight > 0) || !(currentFont > 0)) {
    return clamp(currentFont, minFont, maxFont)
  }

  const ratio = availableHeight / contentHeight

  if (ratio < OVERFLOW_RATIO) {
    const stepped = Math.floor(currentFont * Math.sqrt(ratio))
    const next = Math.min(stepped, currentFont - 1)
    return clamp(next, minFont, maxFont)
  }

  if (ratio > GROW_SLACK_RATIO && currentFont < maxFont) {
    const stepped = Math.floor(currentFont * Math.sqrt(ratio))
    const next = Math.max(stepped, currentFont + 1)
    return clamp(next, minFont, maxFont)
  }

  return clamp(currentFont, minFont, maxFont)
}

export interface UseStickyTextAutoFitOptions {
  /** Ref to the `.sticky-note-editor` wrapper div — receives the `--sticky-font-size` var. */
  wrapperRef: React.RefObject<HTMLElement | null>
  nodeWidth: number
  nodeHeight: number
}

// BlockNote renders block content as `.bn-block-group` nested inside `.bn-editor`. Our own
// CSS (`.sticky-note-editor` rules in index.css) gives `.bn-editor`/`.bn-container` and any
// direct bn-* child of the wrapper `flex: 1` so the editor's click-to-focus surface fills
// the note even when text is short. That stretch makes THOSE elements' scrollHeight report
// the stretched box, not the true content height (nothing overflows them, so scrollHeight
// == clientHeight regardless of how short the text is) — useless for detecting slack.
// `.bn-block-group` is not part of that stretch chain (it's a plain block-level descendant,
// not itself given flex-grow), so its rendered height reflects genuine content extent in
// both directions: it shrinks a real amount below the wrapper's stretched height when text
// is short (room to grow the font), and grows past the wrapper when text overflows (room to
// shrink). Falling back to the wrapper itself keeps this safe in environments without a
// real BlockNote DOM (e.g. unit tests).
function getContentTarget(wrapper: HTMLElement): HTMLElement {
  return wrapper.querySelector<HTMLElement>('.bn-block-group') ?? wrapper
}

/**
 * Wires up sticky note auto-fit text sizing on the given wrapper element. Runs a bounded
 * rAF convergence loop whenever the note's committed width/height change (re-picks the
 * font ceiling, corrects for overflow/slack) and whenever the observed content element's
 * size changes on its own (typing, live drag-resize reflow).
 */
export function useStickyTextAutoFit({ wrapperRef, nodeWidth, nodeHeight }: UseStickyTextAutoFitOptions): void {
  const currentFontRef = useRef<number>(STICKY_BASE_FONT)
  const hasInitializedRef = useRef(false)
  // True while our own rAF loop is applying font changes — the resulting reflow will
  // itself trigger the ResizeObserver; ignore those self-inflicted callbacks so we don't
  // spin forever. Real, externally-caused size changes are picked up once the loop settles
  // (they'll differ from `lastMeasuredRef`).
  const convergingRef = useRef(false)
  const lastMeasuredRef = useRef<{ contentHeight: number; availableHeight: number } | null>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const minFont = STICKY_MIN_FONT
    const maxFont = computeMaxStickyFont(nodeWidth)
    const availableHeight = Math.max(0, nodeHeight - STICKY_BODY_VERTICAL_PADDING)

    let cancelled = false
    let rafId: number | null = null
    let runToken = 0

    const applyFont = (font: number) => {
      currentFontRef.current = font
      wrapper.style.setProperty('--sticky-font-size', `${font}px`)
    }

    const converge = (startFont: number) => {
      const token = ++runToken
      convergingRef.current = true

      let font = startFont
      let iterations = 0

      const step = () => {
        if (cancelled || token !== runToken) return

        const target = getContentTarget(wrapper)
        const measured = { contentHeight: target.scrollHeight, availableHeight }
        lastMeasuredRef.current = measured

        const next = nextStickyFontSize({
          contentHeight: measured.contentHeight,
          availableHeight,
          currentFont: font,
          minFont,
          maxFont,
        })

        if (next === font || iterations >= MAX_CONVERGE_ITERATIONS) {
          if (next !== font) applyFont(next)
          convergingRef.current = false
          return
        }

        font = next
        iterations += 1
        applyFont(font)
        rafId = requestAnimationFrame(step)
      }

      rafId = requestAnimationFrame(step)
    }

    // On first mount, start optimistically at the width-derived max and let the loop
    // shrink it if content overflows. On later re-runs (width/height changed), start from
    // wherever the font already is (clamped into the new range) so a live drag-resize
    // adjusts smoothly instead of flashing back up to max every frame.
    const startFont = hasInitializedRef.current ? clamp(currentFontRef.current, minFont, maxFont) : maxFont
    hasInitializedRef.current = true
    applyFont(startFont)
    converge(startFont)

    const observer = new ResizeObserver(() => {
      if (convergingRef.current) return

      const target = getContentTarget(wrapper)
      const measured = { contentHeight: target.scrollHeight, availableHeight }
      const last = lastMeasuredRef.current
      if (last && last.contentHeight === measured.contentHeight && last.availableHeight === measured.availableHeight) {
        return
      }

      converge(currentFontRef.current)
    })
    observer.observe(getContentTarget(wrapper))

    return () => {
      cancelled = true
      convergingRef.current = false
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [wrapperRef, nodeWidth, nodeHeight])
}
