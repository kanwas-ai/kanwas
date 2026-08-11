import { createContext, useContext, useSyncExternalStore } from 'react'
import { useSnapshot } from 'valtio/react'
import type { WorkspaceContentStore, WorkspaceDocument, WorkspaceSocketProviderInstance } from 'shared'
import type * as Y from 'yjs'
import type { WorkspaceUndoController } from '@/lib/workspaceUndo'
import type { UserIdentity } from '@/lib/userIdentity'

export interface TextSelection {
  nodeId: string
  nodeName: string
  text: string
  lineCount: number
}

export interface TextSelectionStore {
  getSnapshot: () => TextSelection | null
  setTextSelection: (selection: TextSelection | null) => void
  subscribe: (listener: () => void) => () => void
}

export interface WorkspaceContextValue {
  store: WorkspaceDocument
  yDoc: Y.Doc
  provider: WorkspaceSocketProviderInstance
  localUser: UserIdentity
  acquireCursorPresenceSuppression: () => () => void
  isCursorPresenceSuppressed: () => boolean
  contentStore: WorkspaceContentStore
  /** Logical workspace undo/redo controller across root + note docs */
  workspaceUndoController: WorkspaceUndoController
  /** Shared multi-doc UndoManager passed to BlockNote/y-prosemirror */
  sharedEditorUndoManager: Y.UndoManager
  /** True once the initial sync with the Yjs server has completed. Never resets to false. */
  hasInitiallySynced: boolean
  /** Initial sync failure shown while the workspace is still blocked on bootstrap. */
  initialSyncError: string | null
  /** True when WebSocket is currently connected. Can toggle on reconnections. */
  isConnected: boolean
  /** True when the provider is actively attempting to reconnect after a transient disconnect. */
  isReconnecting: boolean
  /** Most recent Socket.IO disconnect reason after initial sync. */
  disconnectReason: string | null
  workspaceId: string
  activeCanvasId: string | null
  setActiveCanvasId: (id: string | null) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
export const TextSelectionContext = createContext<TextSelectionStore | null>(null)

function areTextSelectionsEqual(left: TextSelection | null, right: TextSelection | null): boolean {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.nodeId === right.nodeId &&
    left.nodeName === right.nodeName &&
    left.text === right.text &&
    left.lineCount === right.lineCount
  )
}

export function createTextSelectionStore(initialSelection: TextSelection | null = null): TextSelectionStore {
  let textSelection = initialSelection
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => textSelection,
    setTextSelection: (selection) => {
      if (areTextSelectionsEqual(textSelection, selection)) {
        return
      }

      textSelection = selection
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}

// Custom hook to use just the store (mutable)
export function useWorkspaceStore() {
  const { store } = useWorkspace()
  return { store }
}

// Custom hook to use just the snapshot (read-only reactive)
export function useWorkspaceSnapshot() {
  const { store } = useWorkspace()
  return useSnapshot(store)
}

// Custom hook to access the Yjs document directly
export function useYjsDoc() {
  const { yDoc } = useWorkspace()
  return yDoc
}

// Custom hook to access the provider
export function useWorkspaceProvider() {
  const { provider } = useWorkspace()
  return provider
}

export function useWorkspaceContentStore() {
  const { contentStore } = useWorkspace()
  return contentStore
}

export function useWorkspaceUndoController() {
  const { workspaceUndoController } = useWorkspace()
  return workspaceUndoController
}

export function useWorkspaceUndoManager() {
  const { workspaceUndoController } = useWorkspace()
  return workspaceUndoController.undoManager
}

// Custom hook to access the shared editor undo manager (for cross-editor undo/redo)
export function useEditorUndoManager() {
  const { sharedEditorUndoManager } = useWorkspace()
  return sharedEditorUndoManager
}

// Custom hook to access text selection state
export function useTextSelection() {
  const store = useTextSelectionStore()
  const textSelection = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { textSelection, setTextSelection: store.setTextSelection }
}

export function useTextSelectionStore() {
  const store = useContext(TextSelectionContext)
  if (!store) {
    throw new Error('useTextSelectionStore must be used within WorkspaceProvider')
  }

  return store
}
