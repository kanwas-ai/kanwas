import type { NodeFontFamily } from 'shared'

export const NODE_FONTS: Record<NodeFontFamily, { css: string; label: string }> = {
  'inter': { css: "'Inter', sans-serif", label: 'Inter' },
  'caveat': { css: "'Caveat', cursive", label: 'Caveat' },
  'libre-baskerville': { css: "'Libre Baskerville', serif", label: 'Baskerville' },
}

export const FONT_CSS: Record<NodeFontFamily, string> = {
  'inter': NODE_FONTS.inter.css,
  'caveat': NODE_FONTS.caveat.css,
  'libre-baskerville': NODE_FONTS['libre-baskerville'].css,
}

export const FONT_KEYS = Object.keys(NODE_FONTS) as NodeFontFamily[]

// Keep in sync with STICKY_COLORS in StickyNoteNode.tsx.
// `bg` is the rendered 135° linear-gradient used by sticky notes and toolbar swatches.
const stickyGradient = (from: string, to: string) => `linear-gradient(135deg, ${from} 0%, ${to} 100%)`

export const STICKY_COLOR_SWATCHES = [
  { key: 'yellow', bg: stickyGradient('#FFF5C9', '#F7E37A') },
  { key: 'pink', bg: stickyGradient('#FFD7E8', '#FBA8CC') },
  { key: 'green', bg: stickyGradient('#D5F0DC', '#9ED6A9') },
  { key: 'blue', bg: stickyGradient('#D7E2FF', '#A8BEF0') },
  { key: 'orange', bg: stickyGradient('#FFDBC9', '#FFC6AA') },
  { key: 'purple', bg: stickyGradient('#D0C6FF', '#A596F0') },
  { key: 'beige', bg: stickyGradient('#F4E4CC', '#E5C898') },
  { key: 'coral', bg: stickyGradient('#FFD1C2', '#FDA892') },
  { key: 'teal', bg: stickyGradient('#C8EEDD', '#8AD5B4') },
  { key: 'burgundy', bg: stickyGradient('#F7C9C9', '#E79797') },
]

// ============================================================================
// TEXT NODE (free-form text) SIZE & COLOR PRESETS
// ============================================================================

export type TextSizePresetKey = 'small' | 'medium' | 'large' | 'superLarge'

export const TEXT_SIZE_PRESETS: { key: TextSizePresetKey; label: string; fontSize: number }[] = [
  { key: 'small', label: 'Small', fontSize: 44 },
  { key: 'medium', label: 'Medium', fontSize: 88 },
  { key: 'large', label: 'Large', fontSize: 144 },
  { key: 'superLarge', label: 'Super large', fontSize: 220 },
]

// Flat (non-gradient) swatches for free-form text color. Mid-tone hues chosen to stay
// readable on both a near-white (light theme) and near-black (dark theme) canvas background.
// `default`/stone matches TextNodeData's current default color.
export const TEXT_COLOR_SWATCHES: { key: string; color: string }[] = [
  { key: 'stone', color: '#B1A9A2' },
  { key: 'charcoal', color: '#6B6560' },
  { key: 'red', color: '#D96C5A' },
  { key: 'orange', color: '#DE8F4C' },
  { key: 'yellow', color: '#C9A83B' },
  { key: 'green', color: '#7FAE6A' },
  { key: 'teal', color: '#5FA99E' },
  { key: 'blue', color: '#6E93D0' },
  { key: 'purple', color: '#9B84D8' },
  { key: 'pink', color: '#D87FA8' },
]
