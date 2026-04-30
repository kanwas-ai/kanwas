import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import { capturePostHogEvent } from '@/lib/analytics/posthog'
import { showToast } from '@/utils/toast'
import * as api from '@/api/workspaces'
import type { Workspace } from '@/api/client'
import type { WorkspaceOnboardingStatus } from '@/api/workspaces'

function setWorkspaceOnboardingStatus(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  onboardingStatus: WorkspaceOnboardingStatus
) {
  qc.setQueryData<Workspace>(['workspace', workspaceId], (current) =>
    current ? { ...current, onboardingStatus } : current
  )
  qc.setQueryData<Workspace[]>(['workspaces'], (current) =>
    current?.map((workspace) => (workspace.id === workspaceId ? { ...workspace, onboardingStatus } : workspace))
  )
}

export const useWorkspaces = () => {
  const { state } = useAuth()
  return useQuery({
    queryKey: ['workspaces'],
    enabled: state.isAuthenticated && !state.isLoading,
    queryFn: api.listWorkspaces,
    retry: false,
  })
}

export const useWorkspace = (id?: string) => {
  const { state } = useAuth()
  return useQuery({
    queryKey: ['workspace', id],
    enabled: !!id && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.getWorkspace(id!),
    retry: false,
  })
}

export const useCreateWorkspace = (workspaceId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; workspaceId?: string }) =>
      api.createWorkspace(workspaceId ? { ...body, workspaceId } : body),
    onSuccess: (newWorkspace) => {
      capturePostHogEvent('workspace created', {
        workspace_id: newWorkspace.id,
        workspace_name: newWorkspace.name,
      })
      // Optimistically add to cache so WorkspacePageWrapper finds it before refetch completes
      qc.setQueryData<Workspace[]>(['workspaces'], (old) => (old ? [...old, newWorkspace] : [newWorkspace]))
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['organization'] })
      showToast('Workspace created successfully', 'success')
    },
    onError: () => showToast('Failed to create workspace', 'error'),
  })
}

export const useUpdateWorkspace = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateWorkspace(id, { name }),
    onMutate: async ({ id, name }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['workspaces'] }),
        qc.cancelQueries({ queryKey: ['workspace', id] }),
      ])
      const prevWorkspace = qc.getQueryData<Workspace>(['workspace', id])
      const prevWorkspaces = qc.getQueryData<Workspace[]>(['workspaces'])

      if (prevWorkspace) {
        qc.setQueryData<Workspace>(['workspace', id], {
          ...prevWorkspace,
          name,
        })
      }
      if (prevWorkspaces) {
        qc.setQueryData<Workspace[]>(
          ['workspaces'],
          prevWorkspaces.map((w) => (w.id === id ? { ...w, name } : w))
        )
      }
      return { prevWorkspace, prevWorkspaces }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prevWorkspace) qc.setQueryData(['workspace', id], ctx.prevWorkspace)
      if (ctx?.prevWorkspaces) qc.setQueryData(['workspaces'], ctx.prevWorkspaces)
      showToast('Failed to update workspace', 'error')
    },
    onSuccess: (_updatedWorkspace, { id, name }) => {
      capturePostHogEvent('workspace renamed', {
        workspace_id: id,
        workspace_name: name,
      })
      showToast('Workspace updated successfully', 'success')
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspace', id] })
    },
  })
}

export const useDeleteWorkspace = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteWorkspace,
    onMutate: async (id: string) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['workspaces'] }),
        qc.cancelQueries({ queryKey: ['workspace', id] }),
      ])
      const prev = qc.getQueryData<Workspace[]>(['workspaces'])
      qc.setQueryData<Workspace[]>(['workspaces'], (old) => old?.filter((w) => w.id !== id) ?? old)
      qc.setQueryData(['workspace', id], undefined)
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['workspaces'], ctx.prev)
      showToast('Failed to delete workspace', 'error')
    },
    onSuccess: (_data, id) => {
      capturePostHogEvent('workspace deleted', {
        workspace_id: id,
      })
      showToast('Workspace deleted successfully', 'success')
    },
    onSettled: (_d, _e, id) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspace', id] })
      qc.invalidateQueries({ queryKey: ['organization', id] })
      qc.invalidateQueries({ queryKey: ['organization-invites', id] })
    },
  })
}

export const useDuplicateWorkspace = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.duplicateWorkspace,
    onSuccess: (newWorkspace, sourceWorkspaceId) => {
      capturePostHogEvent('workspace duplicated', {
        source_workspace_id: sourceWorkspaceId,
        workspace_id: newWorkspace.id,
        workspace_name: newWorkspace.name,
      })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['organization'] })
      showToast('Workspace duplicated successfully', 'success')
    },
    onError: () => showToast('Failed to duplicate workspace', 'error'),
  })
}

export const useStartWorkspaceOnboarding = (workspaceId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.startWorkspaceOnboarding(workspaceId)
    },
    onSuccess: (result) => {
      if (!workspaceId) {
        return
      }

      setWorkspaceOnboardingStatus(qc, workspaceId, result.onboardingStatus)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
    },
    onError: () => showToast('Failed to start onboarding', 'error'),
  })
}
