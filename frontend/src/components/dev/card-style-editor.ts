/**
 * Helper module for the CardStyleEditor dev panel.
 *
 * Owns: the CardStyle/state types, the DEFAULTS constant (mirroring
 * index.css), color/shadow composition, the `<style>` override tag lifecycle,
 * and localStorage persistence. Kept separate from the component so the pure
 * logic is easy to reason about / test independently of React.
 */

export type ThemeKey = 'light' | 'dark'

export interface ShadowStyle {
  x: number
  y: number
  blur: number
  spread: number
  /** 6-digit hex, no alpha */
  color: string
  /** 0-1 */
  alpha: number
}

export interface CardStyle {
  /** 6-digit hex background color */
  bg: string
  /** px */
  radius: number
  /** px */
  borderWidth: number
  /** 6-digit hex border color (alpha carried separately) */
  borderColor: string
  /** 0-1 */
  borderAlpha: number
  /** overall card opacity, 0-1 */
  opacity: number
  shadow: ShadowStyle
  /**
   * Raw box-shadow text. When non-empty, this wins over the composed shadow
   * (lets the user type/paste multi-layer shadows by hand).
   */
  shadowRaw: string
  /** 6-digit hex accent border color used when the card is selected */
  borderAccent: string
}

export interface CardStyleEditorState {
  light: CardStyle
  dark: CardStyle
}

export const STORAGE_KEY = 'kanwas-card-style-editor'
export const ENABLE_KEY = 'kanwas-card-style-editor-enabled'
const STYLE_TAG_ID = 'card-style-editor-overrides'

/**
 * Default card style values, resolved to concrete hex/number values.
 * These MUST mirror the ":root" / ".dark" "Node card" tokens in
 * frontend/src/index.css at the time this was written:
 *   :root { --card-bg:#ffffff; --card-radius:20px; --card-border-width:1px;
 *            --card-border:#f0ece0; --card-border-accent: var(--palette-amber-light) /* #f0d69a *\/;
 *            --card-shadow: 0 8px 28px -10px rgba(86,75,44,0.16); --card-opacity:1; }
 *   .dark { --card-bg: #242424; --card-border: var(--outline) /* #252525 *\/;
 *            --card-border-accent: var(--palette-amber-light) /* #775f26 *\/;
 *            --card-shadow: 0 8px 28px -14px rgba(0,0,0,0.35); }
 * If index.css changes, update these too (or hit "Reset all" after manually
 * re-deriving them) so the panel's defaults stay truthful.
 */
export const DEFAULTS: CardStyleEditorState = {
  light: {
    bg: '#ffffff',
    radius: 20,
    borderWidth: 1,
    borderColor: '#f0ece0',
    borderAlpha: 1,
    opacity: 1,
    shadow: { x: 0, y: 8, blur: 28, spread: -10, color: '#564b2c', alpha: 0.16 },
    shadowRaw: '',
    borderAccent: '#f0d69a',
  },
  dark: {
    bg: '#242424',
    radius: 20,
    borderWidth: 1,
    borderColor: '#252525',
    borderAlpha: 1,
    opacity: 1,
    shadow: { x: 0, y: 8, blur: 28, spread: -14, color: '#000000', alpha: 0.35 },
    shadowRaw: '',
    borderAccent: '#775f26',
  },
}

export function cloneDefaults(): CardStyleEditorState {
  return JSON.parse(JSON.stringify(DEFAULTS)) as CardStyleEditorState
}

// --- color helpers ---------------------------------------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim()
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6)
  const int = parseInt(full, 16) || 0
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')
}

export function composeRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function composeBoxShadow(shadow: ShadowStyle): string {
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${composeRgba(shadow.color, shadow.alpha)}`
}

export function resolveShadowValue(style: CardStyle): string {
  return style.shadowRaw.trim().length > 0 ? style.shadowRaw : composeBoxShadow(style.shadow)
}

// --- CSS text / handoff markdown -------------------------------------------

function cssBlock(selector: string, style: CardStyle): string {
  return `${selector} {
  --card-bg: ${style.bg};
  --card-radius: ${style.radius}px;
  --card-border-width: ${style.borderWidth}px;
  --card-border: ${composeRgba(style.borderColor, style.borderAlpha)};
  --card-border-accent: ${style.borderAccent};
  --card-shadow: ${resolveShadowValue(style)};
  --card-opacity: ${style.opacity};
}`
}

export function buildCssText(state: CardStyleEditorState): string {
  return `${cssBlock(':root', state.light)}\n${cssBlock('.dark', state.dark)}`
}

function markdownBlock(title: string, style: CardStyle): string {
  return `### ${title}
--card-bg: ${style.bg}
--card-radius: ${style.radius}px
--card-border-width: ${style.borderWidth}px
--card-border: ${composeRgba(style.borderColor, style.borderAlpha)}
--card-border-accent: ${style.borderAccent}
--card-shadow: ${resolveShadowValue(style)}
--card-opacity: ${style.opacity}`
}

export function buildHandoffMarkdown(state: CardStyleEditorState): string {
  return `## Document card styles (from live editor)
${markdownBlock('Light', state.light)}
${markdownBlock('Dark', state.dark)}`
}

// --- <style> override tag lifecycle ----------------------------------------

export function applyOverrides(state: CardStyleEditorState): void {
  if (typeof document === 'undefined') return
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_TAG_ID
    document.head.appendChild(tag)
  }
  tag.textContent = buildCssText(state)
}

export function removeOverrides(): void {
  if (typeof document === 'undefined') return
  document.getElementById(STYLE_TAG_ID)?.remove()
}

// --- localStorage persistence ----------------------------------------------

function isCardStyle(value: unknown): value is CardStyle {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.bg === 'string' &&
    typeof v.radius === 'number' &&
    typeof v.borderWidth === 'number' &&
    typeof v.borderColor === 'string' &&
    typeof v.borderAlpha === 'number' &&
    typeof v.opacity === 'number' &&
    typeof v.shadowRaw === 'string' &&
    typeof v.borderAccent === 'string' &&
    !!v.shadow &&
    typeof v.shadow === 'object'
  )
}

export function loadPersistedState(): CardStyleEditorState | null {
  try {
    const storage = globalThis.localStorage
    const raw = typeof storage?.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && isCardStyle(parsed.light) && isCardStyle(parsed.dark)) {
      return parsed as CardStyleEditorState
    }
    return null
  } catch (e) {
    console.error('Failed to load card style editor state from localStorage:', e)
    return null
  }
}

export function persistState(state: CardStyleEditorState): void {
  try {
    const storage = globalThis.localStorage
    if (typeof storage?.setItem === 'function') {
      storage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  } catch (e) {
    console.error('Failed to save card style editor state to localStorage:', e)
  }
}

export function clearPersistedState(): void {
  try {
    const storage = globalThis.localStorage
    storage?.removeItem?.(STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear card style editor state from localStorage:', e)
  }
}

// On module load (i.e. app load, since WorkspacePage imports the panel
// unconditionally), reapply any previously-saved overrides so a page reload
// keeps WIP edits visible even if the panel itself isn't currently open.
// If nothing was ever saved, this is a no-op — no override tag is created.
;(function applyPersistedOverridesOnLoad() {
  const saved = loadPersistedState()
  if (saved) applyOverrides(saved)
})()
