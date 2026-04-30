import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import * as api from '@/api/tasks'

export const useTasks = (workspaceId?: string) => {
  const { state } = useAuth()
  const queryClient = useQueryClient()

  const taskListQuery = useQuery({
    queryKey: workspaceId ? api.taskListQueryKey(workspaceId) : ['tasks'],
    enabled: !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listTasks(workspaceId!),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const archiveTaskMutation = useMutation({
    mutationFn: async (task: api.TaskListItem) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.archiveTask(workspaceId, task.taskId)
    },
    onMutate: async (task) => {
      if (!workspaceId) {
        return { previousTasks: undefined, didAddArchiveGuard: false }
      }

      const queryKey = api.taskListQueryKey(workspaceId)
      const archiveGuardQueryKey = api.taskArchiveGuardQueryKey(workspaceId)
      await queryClient.cancelQueries({ queryKey })

      let didAddArchiveGuard = false
      queryClient.setQueryData<string[]>(archiveGuardQueryKey, (current) => {
        const guardedTaskIds = current ?? []
        if (guardedTaskIds.includes(task.taskId)) {
          return guardedTaskIds
        }

        didAddArchiveGuard = true
        return [...guardedTaskIds, task.taskId]
      })

      const previousTasks = queryClient.getQueryData<api.TaskListResponse>(queryKey)

      queryClient.setQueryData<api.TaskListResponse>(queryKey, (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          tasks: current.tasks.filter((existingTask) => existingTask.taskId !== task.taskId),
        }
      })

      return { previousTasks, didAddArchiveGuard }
    },
    onError: (_error, _task, context) => {
      if (!workspaceId) {
        return
      }

      if (context?.previousTasks) {
        queryClient.setQueryData(api.taskListQueryKey(workspaceId), context.previousTasks)
      }

      if (context?.didAddArchiveGuard) {
        queryClient.setQueryData<string[]>(api.taskArchiveGuardQueryKey(workspaceId), (current) =>
          (current ?? []).filter((taskId) => taskId !== _task.taskId)
        )
      }
    },
    onSettled: async (_data, _error, task) => {
      if (workspaceId) {
        await queryClient.invalidateQueries({ queryKey: api.taskListQueryKey(workspaceId) })
        queryClient.setQueryData<string[]>(api.taskArchiveGuardQueryKey(workspaceId), (current) =>
          (current ?? []).filter((taskId) => taskId !== task.taskId)
        )
      }
    },
  })

  return {
    ...taskListQuery,
    archiveTask: archiveTaskMutation.mutateAsync,
  }
}
