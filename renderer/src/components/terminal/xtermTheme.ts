// xterm.js theme, light + dark variants. xterm's ITheme requires literal color values (it
// cannot consume CSS variables), so these mirror the app's light/dark tokens from index.css
// by hand — keep them in sync if those tokens change.
import type { ITheme } from '@xterm/xterm'

// Mirrors the app's dark tokens (--canvas: #313030, --foreground: #c6c5c5).
const darkTheme: ITheme = {
  background: '#313030',
  foreground: '#c6c5c5',
  cursor: '#ffb300',
  cursorAccent: '#313030',
  selectionBackground: 'rgba(255,179,0,0.25)',
  black: '#262626',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc42',
  blue: '#5eb0d3',
  magenta: '#c084fc',
  cyan: '#7dd3c0',
  white: '#c6c5c5',
  brightBlack: '#8a8a8a',
  brightRed: '#ff9494',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#7cc6e0',
  brightMagenta: '#d8a8fd',
  brightCyan: '#a0e8d8',
  brightWhite: '#f0f0f0',
}

// Mirrors the app's light tokens (--canvas: #faf9f5, --foreground/--palette-ink: #2c2920).
// ANSI colors are anchored to the app's established light-mode accents (BlockNote highlight
// palette, --palette-blue, --palette-gold) and tuned for legibility on #faf9f5.
const lightTheme: ITheme = {
  background: '#faf9f5',
  foreground: '#2c2920',
  cursor: '#d69600',
  cursorAccent: '#faf9f5',
  selectionBackground: 'rgba(232,163,0,0.20)',
  black: '#2c2920',
  red: '#c53030',
  green: '#3d7a4e',
  yellow: '#a87900',
  blue: '#0b6e99',
  magenta: '#6940a5',
  cyan: '#0f7b7b',
  white: '#8a8578',
  brightBlack: '#6b665c',
  brightRed: '#e03e3e',
  brightGreen: '#4d9960',
  brightYellow: '#d69600',
  brightBlue: '#1a89ba',
  brightMagenta: '#8257c8',
  brightCyan: '#149999',
  brightWhite: '#2c2920',
}

export function getTerminalTheme(mode: 'light' | 'dark'): ITheme {
  return mode === 'dark' ? darkTheme : lightTheme
}

export const terminalFontFamily = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
export const terminalFontSize = 12.5
export const terminalLineHeight = 1.4
