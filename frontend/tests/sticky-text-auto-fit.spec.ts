import { describe, expect, it } from 'vitest'
import { computeMaxStickyFont, nextStickyFontSize } from '@/hooks/useStickyTextAutoFit'

describe('nextStickyFontSize', () => {
  const bounds = { minFont: 14, maxFont: 96 }

  it('shrinks when content overflows the available height', () => {
    const next = nextStickyFontSize({ contentHeight: 400, availableHeight: 200, currentFont: 32, ...bounds })
    expect(next).toBeLessThan(32)
    expect(next).toBeGreaterThanOrEqual(bounds.minFont)
  })

  it('grows when there is generous slack', () => {
    const next = nextStickyFontSize({ contentHeight: 100, availableHeight: 300, currentFont: 32, ...bounds })
    expect(next).toBeGreaterThan(32)
    expect(next).toBeLessThanOrEqual(bounds.maxFont)
  })

  it('is stable (returns currentFont) when content fits snugly', () => {
    const next = nextStickyFontSize({ contentHeight: 195, availableHeight: 200, currentFont: 32, ...bounds })
    expect(next).toBe(32)
  })

  it('clamps to minFont on overflow even when the damped step would go lower', () => {
    const next = nextStickyFontSize({ contentHeight: 1000, availableHeight: 50, currentFont: 14, ...bounds })
    expect(next).toBe(14)
  })

  it('clamps to maxFont on slack, never stepping past it', () => {
    const next = nextStickyFontSize({ contentHeight: 50, availableHeight: 500, currentFont: 90, ...bounds })
    expect(next).toBeLessThanOrEqual(96)
  })

  it('treats degenerate (zero) measurements as a no-op, clamped into range', () => {
    const next = nextStickyFontSize({ contentHeight: 0, availableHeight: 200, currentFont: 32, ...bounds })
    expect(next).toBe(32)
  })

  it('converges to a stable fixed point for a linear-ish content/font relationship', () => {
    const availableHeight = 200
    // Roughly models "taller content at a bigger font size" (content grows ~linearly with font).
    const contentFor = (font: number) => font * 6

    let font = 96
    let previous = font
    let stableAt = -1

    for (let i = 0; i < 30; i++) {
      const next = nextStickyFontSize({
        contentHeight: contentFor(font),
        availableHeight,
        currentFont: font,
        ...bounds,
      })
      if (next === font) {
        stableAt = i
        break
      }
      previous = font
      font = next
    }

    expect(stableAt).toBeGreaterThanOrEqual(0)
    // Fixed point should land near availableHeight / 6 (~33), not pinned at either bound.
    expect(font).toBeGreaterThan(bounds.minFont)
    expect(font).toBeLessThan(bounds.maxFont)
    expect(Math.abs(font - previous)).toBeLessThanOrEqual(1)
  })

  it('settles at minFont when content can never fit, however small the font', () => {
    const availableHeight = 40
    const contentFor = (font: number) => font * 20 // content always dwarfs the available space

    let font = 96
    for (let i = 0; i < 30; i++) {
      const next = nextStickyFontSize({
        contentHeight: contentFor(font),
        availableHeight,
        currentFont: font,
        ...bounds,
      })
      if (next === font) break
      font = next
    }

    expect(font).toBe(bounds.minFont)
  })
})

describe('computeMaxStickyFont', () => {
  it('returns the base font (32) at the base width (240)', () => {
    expect(computeMaxStickyFont(240)).toBe(32)
  })

  it('scales up proportionally with width', () => {
    expect(computeMaxStickyFont(480)).toBe(64)
  })

  it('clamps at the ceiling (96) for very wide notes', () => {
    expect(computeMaxStickyFont(2000)).toBe(96)
  })

  it('clamps at the floor (16) for narrow notes', () => {
    expect(computeMaxStickyFont(100)).toBe(16)
  })
})
