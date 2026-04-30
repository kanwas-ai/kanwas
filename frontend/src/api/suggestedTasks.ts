import { tuyau } from './client'

export interface WorkspaceSuggestedTask {
  id: string
  emoji: string
  headline: string
  description: string
  prompt: string
  source?: string
}

export interface WorkspaceSuggestedTaskState {
  isLoading: boolean
  tasks: WorkspaceSuggestedTask[]
  generatedAt: string | null
  error: string | null
}

export const workspaceSuggestedTasksQueryKey = (workspaceId: string) =>
  ['workspace-suggested-tasks', workspaceId] as const

export function createEmptyWorkspaceSuggestedTaskState(): WorkspaceSuggestedTaskState {
  return {
    isLoading: false,
    tasks: [],
    generatedAt: null,
    error: null,
  }
}

export async function getWorkspaceSuggestedTasks(workspaceId: string): Promise<WorkspaceSuggestedTaskState> {
  const response = await tuyau.workspaces({ id: workspaceId })['suggested-tasks'].$get()

  if (response.error) {
    throw response.error
  }

  return (response.data as WorkspaceSuggestedTaskState) ?? createEmptyWorkspaceSuggestedTaskState()
}

export async function deleteWorkspaceSuggestedTask(
  workspaceId: string,
  suggestionId: string
): Promise<WorkspaceSuggestedTaskState> {
  const response = await tuyau.workspaces({ id: workspaceId })['suggested-tasks']({ suggestionId }).$delete()

  if (response.error) {
    throw response.error
  }

  return (response.data as WorkspaceSuggestedTaskState) ?? createEmptyWorkspaceSuggestedTaskState()
}
