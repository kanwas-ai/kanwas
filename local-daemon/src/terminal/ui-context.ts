// In-memory per-workspace UI context (WP-C: selection/canvas/document context
// flowing from the frontend into the embedded terminal's coding agent — both
// the explicit "push into stdin" flow and the MCP `kanwas_get_ui_context`
// pull tool). Deliberately NO file writes: this is high-frequency telemetry
// (selection changes, cursor moves) and writing it to disk would spam the
// watcher for no benefit — it only ever needs to answer "what is the user
// looking at right now?"
//
// Node id → file path resolution reuses the SAME PathMapper each mount's
// SyncOrchestrator already maintains for folder↔yDoc sync (see
// SyncOrchestrator.resolveNodePath in sync-orchestrator.ts) — no separate
// mapping is built here.
//
// Everything below takes the narrow `UiContextMount` shape rather than the
// concrete `Mount` class (mirrors workspace-resolution.ts's ResolvableMount) —
// a real `Mount` satisfies it structurally (its `orchestrator` is a
// SyncOrchestrator, which has `resolveNodePath`), and it keeps this module
// unit-testable without spinning up a real mount.
import fs from 'node:fs'
import path from 'node:path'

export interface UiContextMount {
  folder: string
  orchestrator: { resolveNodePath(nodeId: string): string | undefined }
}

/** What the frontend reports on every debounced selection/canvas/document change. */
export interface UiContextInput {
  activeCanvasId: string | null
  selectedNodeIds: string[]
  openDocument: { nodeId: string } | null
  textSelection: { nodeId: string; text: string } | null
}

interface StoredUiContext {
  input: UiContextInput
  updatedAt: string
}

/** A node/text selection resolved to an on-disk location. */
export interface ResolvedRef {
  path: string
  startLine?: number
  endLine?: number
}

/** The shape returned by `GET /workspaces/:id/ui-context` and the MCP pull tool. */
export interface EnrichedUiContext {
  activeCanvasId: string | null
  selectedNodeIds: string[]
  /** Resolved paths for `selectedNodeIds`, in order — entries with no on-disk mapping are dropped. */
  selectedPaths: string[]
  openDocument: { nodeId: string; path: string | null } | null
  textSelection: { nodeId: string; text: string; path: string | null; startLine?: number; endLine?: number } | null
  /** ISO timestamp of the last POST for this workspace, or null if none has landed yet. */
  updatedAt: string | null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse a `POST .../ui-context` body leniently — this is best-effort UI
 * telemetry, not a critical write path, so any field with the wrong shape
 * just falls back to its empty value rather than rejecting the whole request.
 */
export function parseUiContextInput(value: unknown): UiContextInput {
  const body = isObjectRecord(value) ? value : {}
  const activeCanvasId = typeof body.activeCanvasId === 'string' ? body.activeCanvasId : null
  const selectedNodeIds = Array.isArray(body.selectedNodeIds)
    ? body.selectedNodeIds.filter((id): id is string => typeof id === 'string')
    : []
  const openDocument =
    isObjectRecord(body.openDocument) && typeof body.openDocument.nodeId === 'string'
      ? { nodeId: body.openDocument.nodeId }
      : null
  const textSelection =
    isObjectRecord(body.textSelection) &&
    typeof body.textSelection.nodeId === 'string' &&
    typeof body.textSelection.text === 'string'
      ? { nodeId: body.textSelection.nodeId, text: body.textSelection.text }
      : null
  return { activeCanvasId, selectedNodeIds, openDocument, textSelection }
}

/** An enriched context with nothing reported yet — the GET route's response before the first POST. */
export function emptyEnrichedContext(): EnrichedUiContext {
  return {
    activeCanvasId: null,
    selectedNodeIds: [],
    selectedPaths: [],
    openDocument: null,
    textSelection: null,
    updatedAt: null,
  }
}

/** Map of workspaceId → latest reported UI context. One instance lives for the daemon's lifetime. */
export class UiContextStore {
  private readonly entries = new Map<string, StoredUiContext>()

  set(workspaceId: string, input: UiContextInput): void {
    this.entries.set(workspaceId, { input, updatedAt: new Date().toISOString() })
  }

  get(workspaceId: string): StoredUiContext | undefined {
    return this.entries.get(workspaceId)
  }

  /** The workspace with the most recently updated context, or undefined if nothing has been reported. */
  mostRecent(): { workspaceId: string; entry: StoredUiContext } | undefined {
    let best: { workspaceId: string; entry: StoredUiContext } | undefined
    for (const [workspaceId, entry] of this.entries) {
      if (!best || entry.updatedAt > best.entry.updatedAt) best = { workspaceId, entry }
    }
    return best
  }
}

/**
 * Locate `searchText` inside `fileContent` and return its 1-based line range.
 * Whitespace (including line breaks) is normalized to single spaces on both
 * sides before matching, so cosmetic reflow (wrapped lines, extra spaces)
 * doesn't break the match. Returns the FIRST occurrence when the text appears
 * more than once, and undefined when it isn't found at all.
 */
export function resolveTextLines(
  fileContent: string,
  searchText: string
): { startLine: number; endLine: number } | undefined {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  const target = normalize(searchText)
  if (!target) return undefined

  const lines = fileContent.split('\n')
  let normalized = ''
  // Per-line [start, end) offsets into `normalized` (index i ↔ line i+1).
  const lineRanges: Array<{ start: number; end: number }> = []
  for (const line of lines) {
    const normLine = normalize(line)
    if (normLine.length === 0) {
      lineRanges.push({ start: normalized.length, end: normalized.length })
      continue
    }
    if (normalized.length > 0) normalized += ' '
    const start = normalized.length
    normalized += normLine
    lineRanges.push({ start, end: normalized.length })
  }

  const matchStart = normalized.indexOf(target)
  if (matchStart === -1) return undefined
  const matchEnd = matchStart + target.length

  let startLine: number | undefined
  let endLine: number | undefined
  for (let i = 0; i < lineRanges.length; i++) {
    const { start, end } = lineRanges[i]
    if (end <= matchStart) continue
    if (start >= matchEnd) break
    startLine ??= i + 1
    endLine = i + 1
  }
  return startLine !== undefined && endLine !== undefined ? { startLine, endLine } : undefined
}

/**
 * Resolve a node id (+ optional selected text) to an on-disk reference: the
 * node's workspace-relative path, and — when `text` is given and locatable —
 * its 1-based line range within that file. Undefined when the node has no
 * on-disk mapping at all (unknown id, or a metadata-only node type).
 */
export function resolveRef(mount: UiContextMount, nodeId: string, text?: string): ResolvedRef | undefined {
  const relPath = mount.orchestrator.resolveNodePath(nodeId)
  if (!relPath) return undefined
  if (!text) return { path: relPath }

  let content: string
  try {
    content = fs.readFileSync(path.join(mount.folder, relPath), 'utf-8')
  } catch {
    return { path: relPath }
  }
  const lines = resolveTextLines(content, text)
  return lines ? { path: relPath, startLine: lines.startLine, endLine: lines.endLine } : { path: relPath }
}

/** Build the enriched (path/line-resolved) context served by GET /ui-context and the MCP pull tool. */
export function enrichContext(mount: UiContextMount, input: UiContextInput, updatedAt: string): EnrichedUiContext {
  const selectedPaths = input.selectedNodeIds
    .map((id) => mount.orchestrator.resolveNodePath(id))
    .filter((p): p is string => p !== undefined)

  const openDocument = input.openDocument
    ? { nodeId: input.openDocument.nodeId, path: mount.orchestrator.resolveNodePath(input.openDocument.nodeId) ?? null }
    : null

  let textSelection: EnrichedUiContext['textSelection'] = null
  if (input.textSelection) {
    const resolved = resolveRef(mount, input.textSelection.nodeId, input.textSelection.text)
    textSelection = {
      nodeId: input.textSelection.nodeId,
      text: input.textSelection.text,
      path: resolved?.path ?? null,
      ...(resolved?.startLine !== undefined && resolved.endLine !== undefined
        ? { startLine: resolved.startLine, endLine: resolved.endLine }
        : {}),
    }
  }

  return {
    activeCanvasId: input.activeCanvasId,
    selectedNodeIds: input.selectedNodeIds,
    selectedPaths,
    openDocument,
    textSelection,
    updatedAt,
  }
}
