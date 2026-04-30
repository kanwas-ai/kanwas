import { createContext, useContext } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'

export type MountedKanwasEditor = {
  editorNodeId: string
  editor: BlockNoteEditor
} | null

export type State = {
  editors: Map<string, BlockNoteEditor>
  mountedKanwasEditor: MountedKanwasEditor
}

interface ProjectStateContextValue {
  state: State
}

export const ProjectStateContext = createContext<ProjectStateContextValue | undefined>(undefined)

export const useProjectState = () => {
  const context = useContext(ProjectStateContext)
  if (!context) {
    throw new Error('useProjectState must be used within ProjectStateProvider')
  }
  return context
}
