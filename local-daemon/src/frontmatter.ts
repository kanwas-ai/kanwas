// YAML frontmatter split/join — the round-trip guard.
//
// The fidelity spike found (14/14 files) that a leading `---` YAML frontmatter
// fence, fed as-is into BlockNote, is reinterpreted as body: the opening `---`
// becomes a thematic break and the closing `---` turns the preceding line into a
// setext heading. A naive flusher would then write that mangled version back and
// destroy the frontmatter on disk.
//
// The fix (tolaria's model): frontmatter never enters the editor. On READ we
// split it off and stash the EXACT bytes keyed by node id; the editor only ever
// sees the body. On WRITE the flusher re-prepends the stashed frontmatter. The
// stashed block is byte-preserved so a file's frontmatter is byte-identical after
// a UI edit of its body.
//
// Frontmatter survives daemon restarts because it lives in the file itself:
// adoption re-reads every file at boot and re-splits, repopulating the registry.

export interface SplitFrontmatter {
  /** Exact leading frontmatter block (incl. fences + trailing newline), '' if none. */
  frontmatter: string
  /** The document body with the frontmatter removed. */
  body: string
}

// A frontmatter block is a `---` line, some YAML, then a closing `---` line, at
// the very start of the file. We capture the block verbatim (including the
// closing fence's newline when present) so it can be re-emitted byte-for-byte.
const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Split a leading YAML frontmatter block off `text`.
 *
 * Returns `{ frontmatter: '', body: text }` when there is no frontmatter. The
 * `frontmatter` string, when present, is a verbatim slice of `text` (no
 * normalization) so re-prepending it is byte-exact.
 */
export function splitFrontmatter(text: string): SplitFrontmatter {
  // Fast path: must start with a `---` fence.
  if (!text.startsWith('---')) return { frontmatter: '', body: text }
  const match = FRONTMATTER_RE.exec(text)
  if (!match) return { frontmatter: '', body: text }
  const frontmatter = match[0]
  return { frontmatter, body: text.slice(frontmatter.length) }
}

/**
 * Re-prepend a stashed frontmatter block to a freshly-serialized body.
 *
 * The frontmatter is emitted byte-for-byte. A single blank line is inserted
 * between the frontmatter and a non-empty body that does not already start with
 * one, restoring the conventional `---\n...\n---\n\n<body>` shape.
 */
export function joinFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body
  const fm = frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`
  if (body.length === 0) return fm
  const separator = body.startsWith('\n') ? '' : '\n'
  return `${fm}${separator}${body}`
}
