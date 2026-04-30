import React, { useRef, type ReactNode } from 'react'
import { proxy } from 'valtio'
import { NodesSelectionContext, type NodesSelectionState } from './NodesSelectionContext'

interface NodesSelectionProviderProps {
  children: ReactNode
}

export const NodesSelectionProvider: React.FC<NodesSelectionProviderProps> = ({ children }) => {
  const state = useRef(
    proxy<NodesSelectionState>({
      selectedNodeIds: [],
    })
  ).current

  const value = {
    state,
  }

  return <NodesSelectionContext.Provider value={value}>{children}</NodesSelectionContext.Provider>
}
