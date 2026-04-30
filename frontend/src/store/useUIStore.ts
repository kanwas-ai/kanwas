import { proxy, subscribe, useSnapshot } from 'valtio'

type UIState = {
  sidebarOpen: boolean
  zenMode: boolean
  fullScreenMode: boolean
  sidebarWidth: number
  chatWidth: number
  explorerSplitPercent: number
}

export const DEFAULT_UI_STATE: UIState = {
  sidebarOpen: true,
  zenMode: false,
  fullScreenMode: false,
  sidebarWidth: 220,
  chatWidth: 480,
  explorerSplitPercent: 65,
}

function readStoredBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readStoredNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function coerceStoredUIState(stored: unknown): UIState {
  const record = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? stored : {}
  const data = record as Partial<Record<keyof UIState, unknown>>

  return {
    sidebarOpen: readStoredBoolean(data.sidebarOpen, DEFAULT_UI_STATE.sidebarOpen),
    zenMode: readStoredBoolean(data.zenMode, DEFAULT_UI_STATE.zenMode),
    fullScreenMode: readStoredBoolean(data.fullScreenMode, DEFAULT_UI_STATE.fullScreenMode),
    sidebarWidth: readStoredNumber(data.sidebarWidth, DEFAULT_UI_STATE.sidebarWidth),
    chatWidth: readStoredNumber(data.chatWidth, DEFAULT_UI_STATE.chatWidth),
    explorerSplitPercent: readStoredNumber(data.explorerSplitPercent, DEFAULT_UI_STATE.explorerSplitPercent),
  }
}

const initial: UIState = (() => {
  try {
    const storage = globalThis.localStorage
    const stored = typeof storage?.getItem === 'function' ? storage.getItem('ui') : null
    if (stored) {
      return coerceStoredUIState(JSON.parse(stored))
    }
  } catch (e) {
    console.error('Failed to load UI state from localStorage:', e)
  }

  return { ...DEFAULT_UI_STATE }
})()

export const ui = proxy<UIState>(initial)

subscribe(ui, () => {
  try {
    const storage = globalThis.localStorage
    if (typeof storage?.setItem === 'function') {
      storage.setItem('ui', JSON.stringify(ui))
    }
  } catch (e) {
    console.error('Failed to save UI state to localStorage:', e)
  }
})

export const toggleSidebar = () => (ui.sidebarOpen = !ui.sidebarOpen)
export const closeSidebar = () => (ui.sidebarOpen = false)
export const openSidebar = () => (ui.sidebarOpen = true)
export const toggleZenMode = () => (ui.zenMode = !ui.zenMode)
export const enableZenMode = () => (ui.zenMode = true)
export const disableZenMode = () => (ui.zenMode = false)
export const toggleFullScreenMode = () => (ui.fullScreenMode = !ui.fullScreenMode)
export const enableFullScreenMode = () => (ui.fullScreenMode = true)
export const disableFullScreenMode = () => (ui.fullScreenMode = false)
export const setSidebarWidth = (width: number) => (ui.sidebarWidth = width)
export const setChatWidth = (width: number) => (ui.chatWidth = width)
export const setExplorerSplitPercent = (percent: number) => (ui.explorerSplitPercent = percent)

// Focus mode state - separate proxy, NOT persisted to localStorage
type FocusState = {
  focusMode: boolean
  focusedNodeId: string | null
  focusedNodeType: 'blockNote' | null
  savedViewport: { x: number; y: number; zoom: number } | null
  isExiting: boolean
  isSwitchingDocument: boolean // True when switching docs in focus mode (skip animation)
}

const focusState = proxy<FocusState>({
  focusMode: false,
  focusedNodeId: null,
  focusedNodeType: null,
  savedViewport: null,
  isExiting: false,
  isSwitchingDocument: false,
})

export const enterFocusMode = (
  nodeId: string,
  nodeType: 'blockNote',
  viewport: { x: number; y: number; zoom: number },
  isSwitching = false
) => {
  focusState.isSwitchingDocument = isSwitching
  focusState.focusMode = true
  focusState.focusedNodeId = nodeId
  focusState.focusedNodeType = nodeType
  focusState.savedViewport = viewport
  focusState.isExiting = false
}

export const startExitFocusMode = () => {
  focusState.isExiting = true
}

export const exitFocusMode = () => {
  focusState.focusMode = false
  focusState.focusedNodeId = null
  focusState.focusedNodeType = null
  focusState.savedViewport = null
  focusState.isExiting = false
  focusState.isSwitchingDocument = false
}

export function useFocusMode() {
  const snap = useSnapshot(focusState)
  return {
    focusMode: snap.focusMode,
    focusedNodeId: snap.focusedNodeId,
    focusedNodeType: snap.focusedNodeType,
    savedViewport: snap.savedViewport,
    isExiting: snap.isExiting,
    isSwitchingDocument: snap.isSwitchingDocument,
    enterFocusMode,
    startExitFocusMode,
    exitFocusMode,
  }
}

// Connections modal state - separate proxy, NOT persisted to localStorage
const connectionsModalState = proxy<{
  open: boolean
  initialSearch: string | null
  openedFromTip: boolean
}>({
  open: false,
  initialSearch: null,
  openedFromTip: false,
})

export const openConnectionsModal = (opts?: { initialSearch?: string; fromTip?: boolean }) => {
  connectionsModalState.initialSearch = opts?.initialSearch ?? null
  connectionsModalState.openedFromTip = opts?.fromTip ?? false
  connectionsModalState.open = true
}
export const closeConnectionsModal = () => {
  connectionsModalState.open = false
  connectionsModalState.initialSearch = null
  // Don't clear openedFromTip here — the dismiss effect needs to read it after close
}

const clearOpenedFromTip = () => {
  connectionsModalState.openedFromTip = false
}

export function useConnectionsModal() {
  const snap = useSnapshot(connectionsModalState)
  return {
    connectionsModalOpen: snap.open,
    connectionsModalInitialSearch: snap.initialSearch,
    openedFromTip: snap.openedFromTip,
    openConnectionsModal,
    closeConnectionsModal,
    clearOpenedFromTip,
  }
}

export function useIsFocusModeActive(): boolean {
  const snap = useSnapshot(focusState)
  return snap.focusMode
}

export function useUI() {
  const snap = useSnapshot(ui)
  return {
    sidebarOpen: snap.sidebarOpen,
    zenMode: snap.zenMode,
    fullScreenMode: snap.fullScreenMode,
    sidebarWidth: snap.sidebarWidth,
    chatWidth: snap.chatWidth,
    explorerSplitPercent: snap.explorerSplitPercent,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    toggleZenMode,
    enableZenMode,
    disableZenMode,
    toggleFullScreenMode,
    enableFullScreenMode,
    disableFullScreenMode,
    setSidebarWidth,
    setChatWidth,
    setExplorerSplitPercent,
  }
}
