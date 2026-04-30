import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/api/suggestedTasks'
import { useAuth } from '@/providers/auth'

const WORKSPACE_SUGGESTED_TASK_POLL_INTERVAL_MS = 2000

export const useWorkspaceSuggestedTasks = (workspaceId?: string) => {
  const { state } = useAuth()
  const queryClient = useQueryClient()

  const suggestedTasksQuery = useQuery({
    queryKey: workspaceId ? api.workspaceSuggestedTasksQueryKey(workspaceId) : ['workspace-suggested-tasks'],
    enabled: !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.getWorkspaceSuggestedTasks(workspaceId!),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => (query.state.data?.isLoading ? WORKSPACE_SUGGESTED_TASK_POLL_INTERVAL_MS : false),
  })

  const deleteSuggestedTaskMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.deleteWorkspaceSuggestedTask(workspaceId, suggestionId)
    },
    onMutate: async (suggestionId) => {
      if (!workspaceId) {
        return { previousState: undefined }
      }

      const queryKey = api.workspaceSuggestedTasksQueryKey(workspaceId)
      await queryClient.cancelQueries({ queryKey })

      const previousState = queryClient.getQueryData<api.WorkspaceSuggestedTaskState>(queryKey)

      queryClient.setQueryData<api.WorkspaceSuggestedTaskState>(queryKey, (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          tasks: current.tasks.filter((task) => task.id !== suggestionId),
        }
      })

      return { previousState }
    },
    onError: (_error, _suggestionId, context) => {
      if (!workspaceId || !context?.previousState) {
        return
      }

      queryClient.setQueryData(api.workspaceSuggestedTasksQueryKey(workspaceId), context.previousState)
    },
    onSuccess: (state) => {
      if (!workspaceId) {
        return
      }

      queryClient.setQueryData(api.workspaceSuggestedTasksQueryKey(workspaceId), state)
    },
    onSettled: async () => {
      if (!workspaceId) {
        return
      }

      await queryClient.invalidateQueries({ queryKey: api.workspaceSuggestedTasksQueryKey(workspaceId) })
    },
  })

  return {
    ...suggestedTasksQuery,
    deleteSuggestedTask: deleteSuggestedTaskMutation.mutateAsync,
  }
}
