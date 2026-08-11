// Tiny module-level store mirroring the UI context most recently reported to
// local runtime. `uiContextReporter.ts` writes it on every selection/focus
// change; `TerminalPanel`'s "Insert context" action reads it to compose the
// push into the active terminal session. Deliberately NOT threaded through
// WorkspacePage props — this is cross-cutting, low-frequency UI state, same
// spirit as the `ui`/`focusState` valtio proxies in `@/store/useUIStore`.
import { proxy } from 'valtio'

export interface LiveUiContext {
  workspaceId: string | null
  activeCanvasId: string | null
  selectedNodeIds: string[]
  openDocument: { nodeId: string } | null
  textSelection: { nodeId: string; text: string } | null
}

export const uiContextStore = proxy<LiveUiContext>({
  workspaceId: null,
  activeCanvasId: null,
  selectedNodeIds: [],
  openDocument: null,
  textSelection: null,
})

export function setUiContext(context: LiveUiContext): void {
  uiContextStore.workspaceId = context.workspaceId
  uiContextStore.activeCanvasId = context.activeCanvasId
  uiContextStore.selectedNodeIds = context.selectedNodeIds
  uiContextStore.openDocument = context.openDocument
  uiContextStore.textSelection = context.textSelection
}

/** True when there's something an "Insert context" action could push — drives its disabled state. */
export function hasInsertableContext(context: {
  selectedNodeIds: readonly string[]
  openDocument: LiveUiContext['openDocument']
  textSelection: LiveUiContext['textSelection']
}): boolean {
  return context.selectedNodeIds.length > 0 || context.openDocument !== null || context.textSelection !== null
}
