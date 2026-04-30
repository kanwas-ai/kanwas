import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth'
import { showToast } from '@/utils/toast'
import * as api from '@/api/connections'
import type { ToolkitStatus } from '@/api/connections'

interface UseConnectionsOptions {
  enabled?: boolean
}

interface UseToolkitsOptions {
  enabled?: boolean
  search?: string
  isConnected?: boolean
}

export interface RefreshConnectionsOptions {
  waitForToolkit?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

const connectionsQueryKey = (workspaceId: string) => ['connections', workspaceId] as const
const toolkitsWorkspaceQueryKey = (workspaceId: string) => ['toolkits', workspaceId] as const
const toolkitsQueryKey = (workspaceId: string, search?: string, isConnected?: boolean) =>
  ['toolkits', workspaceId, search ?? '', isConnected ?? null] as const

const DEFAULT_TOOLKIT_ACTIVATION_TIMEOUT_MS = 60_000
const DEFAULT_TOOLKIT_ACTIVATION_POLL_INTERVAL_MS = 2_000

function normalizeToolkitKey(toolkit: string | undefined): string {
  return toolkit?.trim().toLowerCase() ?? ''
}

function isActiveConnectedToolkit(toolkit: ToolkitStatus): boolean {
  return (
    toolkit.isConnected &&
    !toolkit.isNoAuth &&
    typeof toolkit.connectedAccountStatus === 'string' &&
    toolkit.connectedAccountStatus.trim().toUpperCase() === 'ACTIVE'
  )
}

function isToolkitActiveInQueryData(data: ToolkitStatus[] | undefined, toolkit: string): boolean {
  if (!data || data.length === 0) {
    return false
  }

  const normalizedToolkit = normalizeToolkitKey(toolkit)
  if (!normalizedToolkit) {
    return false
  }

  return data.some(
    (entry) => normalizeToolkitKey(entry.toolkit) === normalizedToolkit && isActiveConnectedToolkit(entry)
  )
}

function isToolkitActiveInCache(qc: QueryClient, workspaceId: string, toolkit: string): boolean {
  if (!normalizeToolkitKey(toolkit)) {
    return false
  }

  const cachedConnections = qc.getQueryData<ToolkitStatus[]>(connectionsQueryKey(workspaceId))
  if (isToolkitActiveInQueryData(cachedConnections, toolkit)) {
    return true
  }

  const toolkitQueries = qc.getQueriesData<ToolkitStatus[]>({ queryKey: toolkitsWorkspaceQueryKey(workspaceId) })
  return toolkitQueries.some(([, queryData]) => isToolkitActiveInQueryData(queryData, toolkit))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function invalidateConnectionQueries(qc: QueryClient, workspaceId: string): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: connectionsQueryKey(workspaceId), refetchType: 'all' }),
    qc.invalidateQueries({ queryKey: toolkitsWorkspaceQueryKey(workspaceId), refetchType: 'all' }),
  ])
}

async function refetchConnectionQueries(qc: QueryClient, workspaceId: string): Promise<void> {
  await Promise.all([
    qc.refetchQueries({ queryKey: connectionsQueryKey(workspaceId), type: 'all' }),
    qc.refetchQueries({ queryKey: toolkitsWorkspaceQueryKey(workspaceId), type: 'all' }),
  ])
}

export const useConnections = (workspaceId?: string, options: UseConnectionsOptions = {}) => {
  const { state } = useAuth()
  const { enabled = true } = options

  return useQuery({
    queryKey: workspaceId ? connectionsQueryKey(workspaceId) : ['connections', 'unknown'],
    enabled: enabled && !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () => api.listConnectionStatuses(workspaceId!),
    staleTime: 30 * 1000, // 30 seconds
  })
}

export const useToolkits = (workspaceId?: string, options: UseToolkitsOptions = {}) => {
  const { state } = useAuth()
  const { enabled = true, search, isConnected } = options

  return useQuery({
    queryKey: workspaceId ? toolkitsQueryKey(workspaceId, search, isConnected) : ['toolkits', 'unknown'],
    enabled: enabled && !!workspaceId && state.isAuthenticated && !state.isLoading,
    queryFn: () =>
      api.listToolkitStatuses(workspaceId!, {
        search,
        isConnected,
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes - toolkits rarely change
  })
}

export const useInitiateConnection = (workspaceId?: string) => {
  return useMutation({
    mutationFn: async ({
      toolkit,
      customAuth,
      attemptId,
    }: {
      toolkit: string
      customAuth?: {
        mode?: string
        credentials?: Record<string, unknown>
      }
      attemptId?: string
    }) => {
      if (!workspaceId) throw new Error('Workspace ID is required')
      const callbackUrl = new URL(`${import.meta.env.BASE_URL}connections/callback`, window.location.origin)
      if (attemptId) {
        callbackUrl.searchParams.set('attemptId', attemptId)
      }

      return api.initiateConnection(workspaceId, {
        toolkit,
        customAuth,
        callbackUrl: callbackUrl.toString(),
      })
    },
  })
}

export const useDisconnectConnection = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useMutation<void, unknown, string, { previousConnections?: ToolkitStatus[] }>({
    mutationFn: async (connectedAccountId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is required')
      return api.disconnectConnection(workspaceId, connectedAccountId)
    },

    onMutate: async (connectedAccountId) => {
      if (!workspaceId) return {}

      await qc.cancelQueries({ queryKey: connectionsQueryKey(workspaceId) })
      const previousConnections = qc.getQueryData<ToolkitStatus[]>(connectionsQueryKey(workspaceId))

      if (previousConnections) {
        qc.setQueryData<ToolkitStatus[]>(
          connectionsQueryKey(workspaceId),
          previousConnections.map((conn) =>
            conn.connectedAccountId === connectedAccountId
              ? { ...conn, isConnected: false, connectedAccountId: undefined, connectedAccountStatus: undefined }
              : conn
          )
        )
      }

      return { previousConnections }
    },

    onError: (_err, _connectedAccountId, ctx) => {
      if (ctx?.previousConnections && workspaceId) {
        qc.setQueryData(connectionsQueryKey(workspaceId), ctx.previousConnections)
      }
      showToast('Failed to disconnect', 'error')
    },

    onSuccess: () => {
      showToast('Successfully disconnected', 'success')
    },

    onSettled: () => {
      if (workspaceId) {
        void invalidateConnectionQueries(qc, workspaceId)
      }
    },
  })
}

export const useRefreshConnections = (workspaceId?: string) => {
  const qc = useQueryClient()

  return useCallback(
    async (options: RefreshConnectionsOptions = {}): Promise<boolean> => {
      if (!workspaceId) {
        return false
      }

      const toolkitToWaitFor = normalizeToolkitKey(options.waitForToolkit)
      const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TOOLKIT_ACTIVATION_TIMEOUT_MS)
      const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? DEFAULT_TOOLKIT_ACTIVATION_POLL_INTERVAL_MS)

      await refetchConnectionQueries(qc, workspaceId)

      if (!toolkitToWaitFor) {
        return false
      }

      if (isToolkitActiveInCache(qc, workspaceId, toolkitToWaitFor)) {
        return true
      }

      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await sleep(pollIntervalMs)
        await refetchConnectionQueries(qc, workspaceId)

        if (isToolkitActiveInCache(qc, workspaceId, toolkitToWaitFor)) {
          return true
        }
      }

      return false
    },
    [qc, workspaceId]
  )
}
