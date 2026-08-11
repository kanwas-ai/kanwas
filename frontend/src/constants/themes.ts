import type { Theme as BlockNoteTheme } from '@blocknote/mantine'

export type ThemeMode = 'light' | 'dark'

export interface AppTheme {
  mode: ThemeMode
  blockNote: BlockNoteTheme
}

const lightBlockNoteTheme: BlockNoteTheme = {
  colors: {
    editor: {
      text: 'var(--color-foreground)',
      background: 'var(--color-editor)',
    },
    menu: {
      text: 'var(--color-foreground)',
      background: 'var(--color-canvas)',
    },
    tooltip: {
      text: 'var(--color-foreground)',
      background: 'var(--color-block-highlight)',
    },
    hovered: {
      text: 'var(--color-foreground)',
      background: 'var(--color-block-highlight)',
    },
    selected: {
      text: 'var(--color-focused-content)', // your amber-ish text on selection
      background: 'var(--color-focused)', // your amber-ish selection bg
    },
    disabled: {
      text: 'var(--color-foreground-muted)',
      background: 'var(--color-block-highlight)',
    },
    shadow: 'var(--color-active-outline)',
    border: 'var(--color-outline)',
    sideMenu: 'var(--palette-amber)',

    highlights: {
      gray: { text: '#9b9a97', background: '#ebeced' },
      brown: { text: '#64473a', background: '#e9e5e3' },
      red: { text: '#e03e3e', background: '#fbe4e4' },
      orange: { text: '#d9730d', background: '#f6e9d9' },
      yellow: { text: '#dfab01', background: '#fbf3db' },
      green: { text: '#4d6461', background: '#ddedea' },
      blue: { text: '#0b6e99', background: '#ddebf1' },
      purple: { text: '#6940a5', background: '#eae4f2' },
      pink: { text: '#ad1a72', background: '#f4dfeb' },
    },
  },
  borderRadius: 6,
  fontFamily: '"-apple-system", "system-ui", "sans-serif"',
}

const darkBlockNoteTheme: BlockNoteTheme = {
  colors: {
    editor: {
      text: 'var(--color-foreground)',
      background: 'var(--color-editor)',
    },
    menu: {
      text: 'var(--color-foreground)',
      background: 'var(--color-canvas)',
    },
    tooltip: {
      text: 'var(--color-foreground)',
      background: 'var(--color-block-highlight)',
    },
    hovered: {
      text: 'var(--color-foreground)',
      background: 'var(--color-block-highlight)',
    },
    selected: {
      text: 'var(--color-focused-content)', // your amber-ish text on selection
      background: 'var(--color-focused)', // your amber-ish selection bg
    },
    disabled: {
      text: 'var(--color-foreground-muted)',
      background: 'var(--color-block-highlight)',
    },
    shadow: 'var(--color-active-outline)',
    border: 'var(--color-outline)',
    sideMenu: 'var(--palette-amber)',

    highlights: {
      gray: { text: '#d1d5db', background: '#374151' },
      brown: { text: '#d97706', background: '#451a03' },
      red: { text: '#ef4444', background: '#450a0a' },
      orange: { text: '#f97316', background: '#431407' },
      yellow: { text: '#eab308', background: '#422006' },
      green: { text: '#22c55e', background: '#052e16' },
      blue: { text: '#3b82f6', background: '#0c1e3d' },
      purple: { text: '#a855f7', background: '#2e1065' },
      pink: { text: '#ec4899', background: '#500724' },
    },
  },
  borderRadius: 6,
  fontFamily: '"-apple-system", "system-ui", "sans-serif"',
}

export const lightTheme: AppTheme = {
  mode: 'light',
  blockNote: lightBlockNoteTheme,
}

export const darkTheme: AppTheme = {
  mode: 'dark',
  blockNote: darkBlockNoteTheme,
}
