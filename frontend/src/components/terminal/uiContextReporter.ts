// Reports the user's current canvas selection / open document / text
// selection to kanwasd (WP-C), so the embedded terminal's coding agent can
// pull it via MCP, and so the "Insert context" push action always has fresh
// data to compose from. A single `useUiContextReporter(...)` call in
// WorkspacePage feeds this — see uiContextStore.ts for the local mirror the
// push action reads.
//
// Only ever active against kanwasd: the cloud backend has no /ui-context
// route and would 404 on every debounced POST, so this probes
// `GET /terminal/agents` once per page load and disables itself entirely if
// that fails (mirrors useTerminalAgents' own daemon-only assumption).
import { useEffect, useRef } from 'react'
import { subscribe } from 'valtio'
import { focusState } from '@/store/useUIStore'
import { useTextSelectionStore } from '@/providers/workspace'
import { daemonFetch } from './useTerminalSessions'
import { setUiContext, type LiveUiContext } from './uiContextStore'

const REPORT_DEBOUNCE_MS = 300

/** Module-level so every mount of the reporter (there's only ever one) shares a single probe. */
let backendProbe: Promise<boolean> | null = null
function isKanwasBackend(): Promise<boolean> {
  backendProbe ??= daemonFetch('/terminal/agents')
    .then((res) => res.ok)
    .catch(() => false)
  return backendProbe
}

export function useUiContextReporter(
  workspaceId: string,
  activeCanvasId: string | null,
  selectedNodeIds: readonly string[]
): void {
  const textSelectionStore = useTextSelectionStore()
  const reportingEnabledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void isKanwasBackend().then((ok) => {
      if (!cancelled) reportingEnabledRef.current = ok
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const report = () => {
      const textSelection = textSelectionStore.getSnapshot()
      const openDocument =
        focusState.focusMode && focusState.focusedNodeId ? { nodeId: focusState.focusedNodeId } : null

      const context: LiveUiContext = {
        workspaceId,
        activeCanvasId,
        selectedNodeIds: [...selectedNodeIds],
        openDocument,
        textSelection: textSelection ? { nodeId: textSelection.nodeId, text: textSelection.text } : null,
      }
      // Local mirror updates immediately — only the network POST is debounced,
      // so the "Insert context" button/shortcut never lags behind the UI.
      setUiContext(context)

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!reportingEnabledRef.current || !workspaceId) return
        void daemonFetch(`/workspaces/${workspaceId}/ui-context`, {
          method: 'POST',
          body: JSON.stringify({
            activeCanvasId: context.activeCanvasId,
            selectedNodeIds: context.selectedNodeIds,
            openDocument: context.openDocument,
            textSelection: context.textSelection,
          }),
        }).catch(() => {
          // Best-effort telemetry — a dropped POST just means a slightly stale MCP context.
        })
      }, REPORT_DEBOUNCE_MS)
    }

    report()
    const unsubscribeFocus = subscribe(focusState, report)
    const unsubscribeTextSelection = textSelectionStore.subscribe(report)

    return () => {
      unsubscribeFocus()
      unsubscribeTextSelection()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [workspaceId, activeCanvasId, selectedNodeIds, textSelectionStore])
}
