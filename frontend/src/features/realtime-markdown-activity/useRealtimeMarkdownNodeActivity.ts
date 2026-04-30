import { useIsRealtimeMarkdownWriteActive, useRealtimeMarkdownWriteNodeState } from '@/store/realtimeMarkdownWriteStore'

export function useRealtimeMarkdownNodeActivity(nodeId: string) {
  const detachedPreview = useRealtimeMarkdownWriteNodeState(nodeId)
  const hasActiveOperation = useIsRealtimeMarkdownWriteActive(nodeId)

  return {
    detachedPreview,
    hasActiveOperation,
  }
}
