import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { VaultSummary, WorkspaceSummary } from 'shared/local-api'
import { getDesktopBridge, requireDesktopBridge } from '@/lib/desktop'
import { showToast } from '@/utils/toast'
import * as api from '@/api/workspaces'

const workspacesKey = ['workspaces'] as const

export const useWorkspaces = () =>
  useQuery({
    queryKey: workspacesKey,
    queryFn: async (): Promise<WorkspaceSummary[]> => {
      const desktop = getDesktopBridge()
      return desktop ? desktop.listVaults() : api.listWorkspaces()
    },
    retry: false,
  })

export function isVaultSummary(workspace: WorkspaceSummary): workspace is VaultSummary {
  return 'status' in workspace && 'active' in workspace
}

export const useWorkspace = (id?: string) =>
  useQuery({
    queryKey: ['workspace', id],
    enabled: !!id,
    queryFn: () => api.getWorkspace(id!),
    retry: false,
  })

function useVaultMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<WorkspaceSummary | null | void>,
  errorMessage: string
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspacesKey })
    },
    onError: (error) => showToast(error instanceof Error ? error.message : errorMessage, 'error'),
  })
}

export function useOpenVault() {
  return useVaultMutation(() => requireDesktopBridge().openVault(), 'Failed to open folder')
}

export function useActivateVault() {
  return useVaultMutation(
    (workspaceId: string) => requireDesktopBridge().activateVault(workspaceId),
    'Failed to open vault'
  )
}

export function useRenameVault() {
  return useVaultMutation(
    ({ workspaceId, label }: { workspaceId: string; label: string }) =>
      requireDesktopBridge().renameVaultLabel(workspaceId, label),
    'Failed to rename vault'
  )
}

export function useForgetVault() {
  return useVaultMutation(
    (workspaceId: string) => requireDesktopBridge().forgetVault(workspaceId),
    'Failed to remove vault'
  )
}

export function canManageVaults(): boolean {
  return getDesktopBridge() !== null
}
