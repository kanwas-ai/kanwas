// Browser-safe markdown fidelity utilities: pure functions over strings/JSON only.
// No `@blocknote/server-util`, no Node built-ins — this module must be importable from the frontend.
//
// These functions harden the markdown <-> BlockNote round trip against two verified defects:
//   1. BlockNote's markdown parser silently drops inline HTML-like tokens (e.g. `<topic>`).
//   2. One markdown hard break parses into TWO `\n` chars in block text; naive re-serialization
//      of each `\n` as a trailing-`\` line doubles the hard-break count on every round trip.

/** A line plus whether it sits inside (or delimits) a fenced code block. */
interface FenceAwareLine {
  text: string
  inFence: boolean
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/

/** Splits markdown into lines, tagging which ones are inside/delimiting a fenced code block. */
function markFenceAwareLines(lines: string[]): FenceAwareLine[] {
  let fenceChar: string | null = null
  let fenceLen = 0
  const result: FenceAwareLine[] = []

  for (const text of lines) {
    if (fenceChar) {
      result.push({ text, inFence: true })
      if (isFenceCloseLine(text, fenceChar, fenceLen)) {
        fenceChar = null
        fenceLen = 0
      }
      continue
    }

    const match = text.match(FENCE_OPEN_RE)
    if (match) {
      fenceChar = match[1][0]
      fenceLen = match[1].length
      result.push({ text, inFence: true })
      continue
    }

    result.push({ text, inFence: false })
  }

  return result
}

function isFenceCloseLine(line: string, fenceChar: string, fenceLen: number): boolean {
  const trimmed = line.replace(/^ {0,3}/, '')
  let i = 0
  while (i < trimmed.length && trimmed[i] === fenceChar) i++
  return i >= fenceLen && trimmed.slice(i).trim() === ''
}

// Matches a bare `<` (or an already-escaped `\<`) immediately followed by a character that makes
// it read as inline HTML/a tag opener. Re-running this on already-escaped input is a no-op, which
// is what makes escapeInlineHtmlForImport idempotent.
const ESCAPABLE_ANGLE_RE = /(\\)?<(?=[A-Za-z/!?])/g

// Markdown autolinks — `<scheme:...>` and `<user@host>` — are real link syntax, not droppable
// inline HTML; escaping them would demote working links to literal text.
const AUTOLINK_AT_RE = /^<(?:[A-Za-z][A-Za-z0-9+.-]*:[^\s<>]*|[^\s<>]+@[^\s<>]+\.[^\s<>]+)>/

// Finds inline code spans on a single line: a run of N backticks, non-backtick content, then a
// closing run of exactly N backticks not immediately followed by another backtick.
const CODE_SPAN_RE = /(`+)([^`]*?)\1(?!`)/g

function escapeAngleBracketsOutsideCodeSpans(line: string): string {
  let result = ''
  let lastIndex = 0
  CODE_SPAN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CODE_SPAN_RE.exec(line)) !== null) {
    result += escapeAngleBrackets(line.slice(lastIndex, match.index))
    result += match[0]
    lastIndex = match.index + match[0].length
  }
  result += escapeAngleBrackets(line.slice(lastIndex))
  return result
}

function escapeAngleBrackets(text: string): string {
  return text.replace(ESCAPABLE_ANGLE_RE, (fullMatch, backslash: string | undefined, offset: number) => {
    if (backslash) return fullMatch
    if (AUTOLINK_AT_RE.test(text.slice(offset))) return fullMatch
    return `\\${fullMatch}`
  })
}

/**
 * Escapes `<` as `\<` when it reads as inline HTML (followed by a letter, `/`, `!`, or `?`), so
 * BlockNote's markdown parser doesn't silently drop tokens like `<topic>`. Never touches fenced
 * code blocks or inline code spans. Idempotent: re-escaping already-escaped `\<` is a no-op.
 */
export function escapeInlineHtmlForImport(md: string): string {
  const fenceAware = markFenceAwareLines(md.split('\n'))
  return fenceAware.map(({ text, inFence }) => (inFence ? text : escapeAngleBracketsOutsideCodeSpans(text))).join('\n')
}

interface InlineTextContent {
  type: 'text'
  text: string
  [key: string]: unknown
}

function isInlineTextContent(value: unknown): value is InlineTextContent {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'text' &&
    typeof (value as { text?: unknown }).text === 'string'
  )
}

function collapseHardBreaksInText(text: string): string {
  return text.replace(/\n{2,}/g, '\n')
}

function collapseInlineContentArray(content: unknown[]): unknown[] {
  let changed = false
  const mapped = content.map((item) => {
    if (!isInlineTextContent(item)) {
      return item
    }
    const collapsed = collapseHardBreaksInText(item.text)
    if (collapsed === item.text) {
      return item
    }
    changed = true
    return { ...item, text: collapsed }
  })
  return changed ? mapped : content
}

function isTableContentValue(value: unknown): value is { type: 'tableContent'; rows: unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'tableContent' &&
    Array.isArray((value as { rows?: unknown }).rows)
  )
}

function collapseTableContent(tableContent: { rows: unknown[] }): { rows: unknown[] } {
  let rowsChanged = false
  const mappedRows = tableContent.rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return row
    }
    const rowRecord = row as { cells?: unknown[] }
    if (!Array.isArray(rowRecord.cells)) {
      return row
    }

    let cellsChanged = false
    const mappedCells = rowRecord.cells.map((cell) => {
      const cellContent = Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content
      if (!Array.isArray(cellContent)) {
        return cell
      }
      const mappedContent = collapseInlineContentArray(cellContent)
      if (mappedContent === cellContent) {
        return cell
      }
      cellsChanged = true
      return Array.isArray(cell) ? mappedContent : { ...(cell as object), content: mappedContent }
    })

    if (!cellsChanged) {
      return row
    }
    rowsChanged = true
    return { ...rowRecord, cells: mappedCells }
  })

  return rowsChanged ? { ...tableContent, rows: mappedRows } : tableContent
}

function collapseBlock(block: unknown): unknown {
  if (!block || typeof block !== 'object') {
    return block
  }

  const blockRecord = block as { type?: unknown; content?: unknown; children?: unknown }
  if (blockRecord.type === 'codeBlock') {
    return block
  }

  let changed = false
  let nextContent = blockRecord.content
  let nextChildren = blockRecord.children

  if (Array.isArray(blockRecord.content)) {
    const mapped = collapseInlineContentArray(blockRecord.content)
    if (mapped !== blockRecord.content) {
      changed = true
      nextContent = mapped
    }
  } else if (isTableContentValue(blockRecord.content)) {
    const mapped = collapseTableContent(blockRecord.content)
    if (mapped !== blockRecord.content) {
      changed = true
      nextContent = mapped
    }
  }

  if (Array.isArray(blockRecord.children)) {
    const mapped = collapseHardBreakRunsInBlocks(blockRecord.children)
    if (mapped !== blockRecord.children) {
      changed = true
      nextChildren = mapped
    }
  }

  if (!changed) {
    return block
  }
  return { ...blockRecord, content: nextContent, children: nextChildren }
}

/**
 * Walks BlockNote block JSON recursively and collapses runs of 2+ `\n` in inline `text` node
 * content down to a single `\n`. This fixes the root cause of exponential `\`-line growth: one
 * markdown hard break parses into two `\n` chars, and each would otherwise re-serialize as its
 * own trailing-`\` line. `codeBlock`-type blocks are skipped entirely — their text legitimately
 * contains newlines.
 */
export function collapseHardBreakRunsInBlocks(blocks: unknown[]): unknown[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return blocks
  }
  let changed = false
  const mapped = blocks.map((block) => {
    const next = collapseBlock(block)
    if (next !== block) changed = true
    return next
  })
  return changed ? mapped : blocks
}

const THEMATIC_BREAK_RE = /^ {0,3}([*_-])(?: *\1){2,} *$/
const BULLET_MARKER_RE = /^(\s*)[*+](?=\s)/
// Exactly ONE backslash: that's the round-trip break artifact. A line of `\\` (two chars) is a
// legitimate escaped-backslash paragraph and must survive.
const STRAY_HARD_BREAK_LINE_RE = /^\\$/

function normalizeBulletAndRuleLine(line: string): string {
  if (THEMATIC_BREAK_RE.test(line)) {
    return '---'
  }
  return line.replace(BULLET_MARKER_RE, '$1-')
}

function collapseBlankLineRuns(lines: FenceAwareLine[]): FenceAwareLine[] {
  const result: FenceAwareLine[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const isBlank = !line.inFence && line.text.trim() === ''
    if (!isBlank) {
      result.push(line)
      i++
      continue
    }

    let j = i
    while (j < lines.length && !lines[j].inFence && lines[j].text.trim() === '') j++
    const runLength = j - i
    if (runLength >= 3) {
      result.push(lines[i])
    } else {
      for (let k = i; k < j; k++) result.push(lines[k])
    }
    i = j
  }
  return result
}

/**
 * Line-based cleanup pass over markdown produced by the BlockNote serializer. Outside fenced code
 * blocks: normalizes `*`/`+` bullets to `-` and `***`/`___`/`* * *` thematic breaks to `---`
 * (preserving indentation and ordered lists), deletes stray hard-break-only lines, collapses runs
 * of 3+ blank lines to one, strips trailing blank lines, and ensures exactly one trailing `\n`.
 * Bytes inside fenced code blocks are left untouched.
 */
export function postProcessExportedMarkdown(md: string): string {
  const fenceAware = markFenceAwareLines(md.split('\n'))

  const cleaned: FenceAwareLine[] = []
  for (const line of fenceAware) {
    if (line.inFence) {
      cleaned.push(line)
      continue
    }
    if (STRAY_HARD_BREAK_LINE_RE.test(line.text)) {
      continue
    }
    cleaned.push({ text: normalizeBulletAndRuleLine(line.text), inFence: false })
  }

  const collapsed = collapseBlankLineRuns(cleaned)

  while (collapsed.length > 0) {
    const last = collapsed[collapsed.length - 1]
    if (last.inFence || last.text.trim() !== '') break
    collapsed.pop()
  }

  return `${collapsed.map((line) => line.text).join('\n')}\n`
}
