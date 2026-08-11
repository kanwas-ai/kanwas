import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import { showToast } from '@/utils/toast'
import * as api from '@/api/organizations'

function invalidateOrganizationContextCaches(qc: ReturnType<typeof useQueryClient>, workspaceId?: string) {
  qc.invalidateQueries({ queryKey: ['workspaces'] })
  qc.invalidateQueries({ queryKey: ['workspace'] })
  qc.invalidateQueries({ queryKey: ['organization'] })
  qc.invalidateQueries({ queryKey: ['organization-invites'] })
  qc.invalidateQueries({ queryKey: ['organization-members'] })
  qc.invalidateQueries({ queryKey: ['my-organizations'] })

  if (workspaceId) {
    qc.invalidateQueries({ queryKey: ['organization', workspaceId] })
    qc.invalidateQueries({ queryKey: ['organization-invites', workspaceId] })
    qc.invalidateQueries({ queryKey: ['organization-members', workspaceId] })
  }
}

export const useMyOrganizations = () => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['my-organizations'],
    enabled: state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listMyOrganizations(),
    retry: false,
  })
}

export const useOrganization = (workspaceId?: string) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['organization', workspaceId],
    enabled: !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.getOrganization(workspaceId!),
    retry: false,
  })
}

export const useUpdateOrganization = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.updateOrganization(workspaceId, { name })
    },
    onSuccess: (organization) => {
      if (workspaceId) {
        qc.setQueryData(['organization', workspaceId], organization)
      }

      invalidateOrganizationContextCaches(qc, workspaceId)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update team'
      showToast(message, 'error')
    },
  })
}

export const useOrganizationMembers = (workspaceId?: string, options?: { enabled?: boolean }) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['organization-members', workspaceId],
    enabled: !!workspaceId && (options?.enabled ?? true) && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listOrganizationMembers(workspaceId!),
    retry: false,
  })
}

export const useUpdateOrganizationMemberRole = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'member' }) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.updateOrganizationMemberRole(workspaceId, userId, role)
    },
    onSuccess: () => {
      invalidateOrganizationContextCaches(qc, workspaceId)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update role'
      showToast(message, 'error')
    },
  })
}

export const useRemoveOrganizationMember = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.removeOrganizationMember(workspaceId, userId)
    },
    onSuccess: () => {
      invalidateOrganizationContextCaches(qc, workspaceId)
    },
    onError: (error) => {
      if (error instanceof api.RemoveOrganizationMemberError && error.code) {
        return
      }

      const message = error instanceof Error ? error.message : 'Failed to remove member'
      showToast(message, 'error')
    },
  })
}
