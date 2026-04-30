import { createContext, useContext } from 'react'
import type { WorkspaceInterlinkSuggestion } from '@/lib/workspaceInterlinks'

const WorkspaceInterlinksContext = createContext<WorkspaceInterlinkSuggestion[]>([])

export const WorkspaceInterlinksProvider = WorkspaceInterlinksContext.Provider

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceInterlinks(): WorkspaceInterlinkSuggestion[] {
  return useContext(WorkspaceInterlinksContext)
}
