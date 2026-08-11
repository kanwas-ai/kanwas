// Claude Code's submitted-command transcript bar paints itself with a hardcoded dark
// truecolor background regardless of the host terminal's theme (upstream bug, closed
// wontfix: anthropics/claude-code#49848). Captured raw output shows the exact sequence:
// `ESC[48;2;55;55;55m` (bg #373737), followed by fg sequences for the bar text.
//
// Since this frontend owns the raw byte stream between the WebSocket and xterm.js
// (TerminalView.tsx), we rewrite the offending background escape sequence ourselves when
// the app is in light mode. Foreground legibility on the remapped background is handled
// separately by xterm's already-shipped `minimumContrastRatio` option, which automatically
// darkens/lightens foreground colors to meet a contrast ratio against the actual cell
// background — so only backgrounds ever need an entry in this table.
interface AnsiRewriteRule {
  from: string
  to: string
}

const REWRITE_TABLE: AnsiRewriteRule[] = [
  // Claude Code submitted-message bar background: truecolor #373737 -> the app's light
  // `--canvas-card` token (#f0f0f0).
  { from: '\x1b[48;2;55;55;55m', to: '\x1b[48;2;240;240;240m' },
]

const MAX_PATTERN_LENGTH = REWRITE_TABLE.reduce((max, { from }) => Math.max(max, from.length), 0)

function applyRewrites(text: string): string {
  let result = text
  for (const { from, to } of REWRITE_TABLE) {
    if (result.includes(from)) {
      result = result.split(from).join(to)
    }
  }
  return result
}

// True if `suffix` is a non-empty, strictly-shorter prefix of at least one mapped `from`
// pattern — i.e. it could still grow into a full match once more bytes arrive. A suffix
// that happens to start with ESC but diverges from every pattern (e.g. `\x1b[31m`, or
// `\x1b[3` since every mapped pattern's third character is `4`) is NOT a partial match and
// must not be held back, or unrelated output would be delayed indefinitely.
function isPartialPatternMatch(suffix: string): boolean {
  return REWRITE_TABLE.some(({ from }) => suffix.length < from.length && from.startsWith(suffix))
}

// Finds the split point in `text` (already had rewrites applied) such that `text.slice(0,
// splitIndex)` is safe to emit now and `text.slice(splitIndex)` must be held back as `carry`
// because it might be the start of a mapped sequence that hasn't fully arrived yet.
//
// Scans candidate tail-suffixes from longest to shortest, bounded by the longest pattern
// minus one (a genuine partial match can never be longer than that), and returns the first
// one that is a genuine partial-prefix match.
function findCarrySplitIndex(text: string): number {
  const maxCheck = Math.min(text.length, MAX_PATTERN_LENGTH - 1)
  for (let len = maxCheck; len > 0; len--) {
    const suffix = text.slice(text.length - len)
    if (isPartialPatternMatch(suffix)) {
      return text.length - len
    }
  }
  return text.length
}

/**
 * Creates a streaming rewriter that patches theme-hostile ANSI sequences emitted by Claude
 * Code out of the raw terminal byte stream. `getMode` is read fresh on every `transform`
 * call, so flipping the app theme mid-stream is safe.
 *
 * Sequences can arrive split across WebSocket frames/chunks. `transform` maintains an
 * internal `carry` of held-back bytes so a partially-arrived pattern is never emitted (and
 * never lost) — callers should feed chunks in order and concatenate the return values.
 */
export function createAnsiThemeRewriter(getMode: () => 'light' | 'dark') {
  let carry = ''

  function transform(text: string): string {
    const combined = carry + text
    const processed = getMode() === 'light' ? applyRewrites(combined) : combined

    const splitIndex = findCarrySplitIndex(processed)
    carry = processed.slice(splitIndex)
    return processed.slice(0, splitIndex)
  }

  return { transform }
}
