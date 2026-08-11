import { createContext, useContext, useSyncExternalStore } from 'react'

/**
 * Shared context types and hooks used by TreeNode.
 * Both CanvasTree and DocumentList provide these contexts so TreeNode
 * works in either parent without knowing which one wraps it.
 */

export interface TreeStateContextValue {
  activeCanvasIdRef: React.RefObject<string | null>
  selectedNodeIdsRef: React.RefObject<string[] | undefined>
}

export const TreeStateContext = createContext<TreeStateContextValue | null>(null)

export function useTreeState() {
  const ctx = useContext(TreeStateContext)
  if (!ctx) throw new Error('useTreeState must be used within a tree component')
  return ctx
}

export interface DropTargetStore {
  getSnapshot: () => string | null
  subscribe: (callback: () => void) => () => void
}

export const DropTargetContext = createContext<DropTargetStore | null>(null)

export interface SelectionStore {
  getSnapshot: () => string[] | undefined
  subscribe: (callback: () => void) => () => void
}

export const SelectionContext = createContext<SelectionStore | null>(null)

const emptySubscribe = () => () => {}
const emptyGetSnapshot = () => null
const emptySelectionGetSnapshot = () => undefined

export function useSelectedNodeIds(): string[] | undefined {
  const store = useContext(SelectionContext)
  return useSyncExternalStore(
    store?.subscribe ?? emptySubscribe,
    store?.getSnapshot ?? emptySelectionGetSnapshot,
    store?.getSnapshot ?? emptySelectionGetSnapshot
  )
}

export function useDropTargetParentId(): string | null {
  const store = useContext(DropTargetContext)
  return useSyncExternalStore(
    store?.subscribe ?? emptySubscribe,
    store?.getSnapshot ?? emptyGetSnapshot,
    store?.getSnapshot ?? emptyGetSnapshot
  )
}
