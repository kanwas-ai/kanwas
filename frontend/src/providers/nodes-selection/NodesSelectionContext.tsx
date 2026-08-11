import { createContext, useContext } from 'react'

export interface NodesSelectionState {
  selectedNodeIds: string[]
}

interface NodesSelectionContextValue {
  state: NodesSelectionState
}

export const NodesSelectionContext = createContext<NodesSelectionContextValue | undefined>(undefined)

export const useNodesSelection = () => {
  const context = useContext(NodesSelectionContext)
  if (!context) {
    throw new Error('useNodesSelection must be used within NodesSelectionProvider')
  }
  return context
}
