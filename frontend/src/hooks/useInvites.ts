import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import * as api from '@/api/invites'
import { showToast } from '@/utils/toast'

function invalidateWorkspaceContextCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['workspaces'] })
  qc.invalidateQueries({ queryKey: ['workspace'] })
  qc.invalidateQueries({ queryKey: ['organization'] })
  qc.invalidateQueries({ queryKey: ['organization-invites'] })
  qc.invalidateQueries({ queryKey: ['organization-members'] })
  qc.invalidateQueries({ queryKey: ['my-organizations'] })
  qc.invalidateQueries({ queryKey: ['me'] })
}

export const useOrganizationInvites = (workspaceId?: string, options?: { enabled?: boolean }) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: ['organization-invites', workspaceId],
    enabled: !!workspaceId && (options?.enabled ?? true) && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listOrganizationInvites(workspaceId!),
    retry: false,
  })
}

export const useCreateOrganizationInvite = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (body: { inviteeName?: string; roleToGrant?: 'admin' | 'member'; expiresInDays?: number }) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.createOrganizationInvite(workspaceId, body)
    },
    onSuccess: () => {
      invalidateWorkspaceContextCaches(qc)
      if (workspaceId) qc.invalidateQueries({ queryKey: ['organization-invites', workspaceId] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to create invite link'
      showToast(message, 'error')
    },
  })
}

export const useRevokeOrganizationInvite = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required')
      }

      return api.revokeOrganizationInvite(workspaceId, inviteId)
    },
    onSuccess: () => {
      invalidateWorkspaceContextCaches(qc)
      if (workspaceId) qc.invalidateQueries({ queryKey: ['organization-invites', workspaceId] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to revoke invite link'
      showToast(message, 'error')
    },
  })
}

export const useAcceptOrganizationInvite = () => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (token: string) => api.acceptOrganizationInvite(token),
    onSuccess: () => {
      invalidateWorkspaceContextCaches(qc)
      showToast('Invite accepted successfully', 'success')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to accept invite'
      showToast(message, 'error')
    },
  })
}

export const useOrganizationInvitePreview = (token?: string) => {
  return useQuery({
    queryKey: ['organization-invite-preview', token],
    enabled: Boolean(token),
    queryFn: () => api.previewOrganizationInvite(token!),
    retry: false,
  })
}
