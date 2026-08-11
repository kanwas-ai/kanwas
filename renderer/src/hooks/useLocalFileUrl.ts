import { useMemo } from 'react'
import { rawFileUrl } from '@/api/client'
import { useWorkspace } from '@/providers/workspace'

export function useLocalFileUrl(path: string | undefined, contentHash?: string) {
  const { workspaceId } = useWorkspace()
  return useMemo(() => (path ? rawFileUrl(workspaceId, path, { contentHash }) : null), [contentHash, path, workspaceId])
}
