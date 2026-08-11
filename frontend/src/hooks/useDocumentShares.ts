import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import * as api from '@/api/documentShares'
import type { DocumentShareOwnerState, WorkspaceDocumentSharesState } from 'shared/document-share'

function documentShareQueryKey(workspaceId?: string, noteId?: string) {
  return ['document-share', workspaceId, noteId] as const
}

function workspaceDocumentSharesQueryKey(workspaceId?: string) {
  return ['workspace-document-shares', workspaceId] as const
}

function setDocumentShareQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  noteId: string | undefined,
  ownerState: DocumentShareOwnerState
) {
  if (!workspaceId || !noteId) {
    return
  }

  queryClient.setQueryData(documentShareQueryKey(workspaceId, noteId), ownerState)
}

function setWorkspaceDocumentSharesQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  update: (current: WorkspaceDocumentSharesState) => WorkspaceDocumentSharesState
) {
  if (!workspaceId) {
    return
  }

  queryClient.setQueryData<WorkspaceDocumentSharesState>(workspaceDocumentSharesQueryKey(workspaceId), (current) =>
    update(
      current ?? {
        workspaceId,
        shares: [],
      }
    )
  )
}

function syncWorkspaceDocumentSharesQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  ownerState: DocumentShareOwnerState
) {
  setWorkspaceDocumentSharesQueryData(queryClient, workspaceId, (current) => {
    const existingIndex = current.shares.findIndex((share) => share.noteId === ownerState.noteId)
    const nextShares = current.shares.slice()

    if (ownerState.share) {
      if (existingIndex >= 0) {
        nextShares[existingIndex] = ownerState.share
      } else {
        nextShares.unshift(ownerState.share)
      }
    } else if (existingIndex >= 0) {
      nextShares.splice(existingIndex, 1)
    }

    return {
      workspaceId: current.workspaceId,
      shares: nextShares,
    }
  })
}

async function refreshWorkspaceDocumentShares(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined
) {
  if (!workspaceId) {
    return
  }

  await queryClient
    .fetchQuery({
      queryKey: workspaceDocumentSharesQueryKey(workspaceId),
      queryFn: () => api.listWorkspaceDocumentShares(workspaceId),
    })
    .catch(() => undefined)
}

export const useWorkspaceDocumentShares = (workspaceId?: string) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: workspaceDocumentSharesQueryKey(workspaceId),
    enabled: !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listWorkspaceDocumentShares(workspaceId!),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
}

export const useDocumentShare = (workspaceId?: string, noteId?: string, options: { enabled?: boolean } = {}) => {
  const { state } = useAuth()

  return useQuery({
    queryKey: documentShareQueryKey(workspaceId, noteId),
    enabled: !!workspaceId && !!noteId && state.isAuthenticated && !state.isLoading && (options.enabled ?? true),
    queryFn: () => api.getDocumentShare(workspaceId!, noteId!),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
}

export const useCreateDocumentShare = (workspaceId?: string, noteId?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: api.SaveDocumentShareInput) => {
      if (!workspaceId || !noteId) {
        throw new Error('Workspace ID and note ID are required')
      }

      return api.createDocumentShare(workspaceId, noteId, input)
    },
    onSuccess: async (ownerState) => {
      setDocumentShareQueryData(queryClient, workspaceId, noteId, ownerState)
      syncWorkspaceDocumentSharesQueryData(queryClient, workspaceId, ownerState)
      await refreshWorkspaceDocumentShares(queryClient, workspaceId)
    },
  })
}

export const useUpdateDocumentShare = (workspaceId?: string, noteId?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: api.SaveDocumentShareInput) => {
      if (!workspaceId || !noteId) {
        throw new Error('Workspace ID and note ID are required')
      }

      return api.updateDocumentShare(workspaceId, noteId, input)
    },
    onSuccess: async (ownerState) => {
      setDocumentShareQueryData(queryClient, workspaceId, noteId, ownerState)
      syncWorkspaceDocumentSharesQueryData(queryClient, workspaceId, ownerState)
      await refreshWorkspaceDocumentShares(queryClient, workspaceId)
    },
  })
}

export const useDisableDocumentShare = (workspaceId?: string, noteId?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!workspaceId || !noteId) {
        throw new Error('Workspace ID and note ID are required')
      }

      return api.disableDocumentShare(workspaceId, noteId)
    },
    onSuccess: async (ownerState) => {
      setDocumentShareQueryData(queryClient, workspaceId, noteId, ownerState)
      syncWorkspaceDocumentSharesQueryData(queryClient, workspaceId, ownerState)
      await refreshWorkspaceDocumentShares(queryClient, workspaceId)
    },
  })
}
