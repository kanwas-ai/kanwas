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
