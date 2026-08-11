// Composes the reference text for the "Insert context" push action (WP-C):
// selected node(s) → `@<relpath> ` per node; a text selection → resolved
// `<relpath>:<startLine>-<endLine> ` (or `@<relpath> ` when no lines
// resolve). Reads the live selection from uiContextStore (not props — see
// that module's header) and resolves node ids to paths via kanwasd's
// `POST /workspaces/:id/resolve-context`.
import { daemonFetch } from './useTerminalSessions'
import { uiContextStore } from './uiContextStore'

interface ResolvedContext {
  path: string
  startLine?: number
  endLine?: number
}

async function resolveContext(
  workspaceId: string,
  body: { nodeId: string; text?: string }
): Promise<ResolvedContext | null> {
  try {
    const res = await daemonFetch(`/workspaces/${workspaceId}/resolve-context`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return (await res.json()) as ResolvedContext
  } catch {
    return null
  }
}

/**
 * Compose the text to push into the active terminal session's stdin for the
 * CURRENT ui context. Precedence: an active text selection wins (it's the
 * more specific target); otherwise every selected node; otherwise the open
 * document. Null when nothing resolves to a file on disk.
 */
export async function composeContextInsertText(workspaceId: string): Promise<string | null> {
  const context = uiContextStore

  if (context.textSelection) {
    const resolved = await resolveContext(workspaceId, {
      nodeId: context.textSelection.nodeId,
      text: context.textSelection.text,
    })
    if (!resolved) return null
    return resolved.startLine !== undefined && resolved.endLine !== undefined
      ? `${resolved.path}:${resolved.startLine}-${resolved.endLine} `
      : `@${resolved.path} `
  }

  const nodeIds =
    context.selectedNodeIds.length > 0
      ? context.selectedNodeIds
      : context.openDocument
        ? [context.openDocument.nodeId]
        : []
  if (nodeIds.length === 0) return null

  const parts: string[] = []
  for (const nodeId of nodeIds) {
    const resolved = await resolveContext(workspaceId, { nodeId })
    if (resolved) parts.push(`@${resolved.path} `)
  }
  return parts.length > 0 ? parts.join('') : null
}
