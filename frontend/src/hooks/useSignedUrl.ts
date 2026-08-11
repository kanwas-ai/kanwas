import { useQuery } from '@tanstack/react-query'
import { tuyau } from '@/api/client'

export function useSignedUrl(path: string | undefined, contentHash?: string) {
  return useQuery({
    // Include contentHash in key - when it changes, cache automatically invalidates
    queryKey: ['signed-url', path, contentHash],
    queryFn: async () => {
      if (!path) return null
      const response = await tuyau.files['signed-url'].$get({ query: { path } })
      return response.data?.url || null
    },
    enabled: !!path,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
