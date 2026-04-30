import React, { useRef, type ReactNode } from 'react'
import { proxy } from 'valtio'
import { ProjectStateContext, type State } from './ProjectStateContext'
import { proxyMap } from 'valtio/utils'

interface ProjectStateProviderProps {
  children: ReactNode
}

export const ProjectStateProvider: React.FC<ProjectStateProviderProps> = ({ children }) => {
  const state = useRef(proxy<State>({ editors: proxyMap(), mountedKanwasEditor: null })).current

  const value = {
    state: state,
  }

  return <ProjectStateContext.Provider value={value}>{children}</ProjectStateContext.Provider>
}
