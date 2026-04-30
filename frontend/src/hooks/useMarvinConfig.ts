import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarvinConfig, updateMarvinConfig, type MarvinConfig, type MarvinConfigResponse } from '@/api/marvinConfig'

export const useMarvinConfig = (workspaceId: string, enabled: boolean = true) => {
  const queryClient = useQueryClient()

  const query = useQuery<MarvinConfigResponse>({
    queryKey: ['marvin-config', workspaceId],
    queryFn: () => getMarvinConfig(workspaceId),
    enabled: enabled && !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (updates: MarvinConfig) => updateMarvinConfig(workspaceId, updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['marvin-config', workspaceId], (old: MarvinConfigResponse | undefined) => ({
        config: data.config,
        defaults: old?.defaults ?? data.config,
        workspaceId,
      }))
    },
  })

  return {
    config: query.data?.config,
    defaults: query.data?.defaults,
    workspaceId: query.data?.workspaceId,
    isLoading: query.isLoading,
    error: query.error,
    updateConfig: (updates: MarvinConfig) => mutation.mutate(updates),
    isUpdating: mutation.isPending,
  }
}
