import { useEffect, memo, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import type { CanvasItem } from 'shared'
import { useChat } from '@/providers/chat'
import { useWorkspace } from '@/providers/workspace'
import { resolveWorkspacePath } from '@/lib/workspaceUtils'
import { useWorkspaceStructure } from '@/hooks/useWorkspaceStructure'
import { mergeTimelineWithStreaming } from '@/components/chat/streamingTimeline'
import {
  REALTIME_MD_WRITE_TICK_MS,
  clearRealtimeMarkdownWrites,
  hasDetachedRealtimeMarkdownWriteOperation,
  hasRealtimeMarkdownWriteOperation,
  syncRealtimeMarkdownWriteSources,
  tickRealtimeMarkdownWrites,
  type RealtimeMarkdownWriteSource,
} from '@/store/realtimeMarkdownWriteStore'

const REALTIME_MARKDOWN_WRITE_TOOL_NAME = 'write_file'
const PULSE_ONLY_TOOL_NAMES = new Set(['read_file', 'edit_file'])
const VIEW_ACTIVITY_MIN_VISIBLE_MS = 2_000

export const RealtimeMarkdownWriteController = memo(function RealtimeMarkdownWriteController() {
  const { state } = useChat()
  const snapshot = useSnapshot(state)
  const { store } = useWorkspace()
  const { sidebarRoot } = useWorkspaceStructure(store)
  const root = (sidebarRoot as CanvasItem | null) ?? null
  const timelineWithStreaming = useMemo(
    () => mergeTimelineWithStreaming(snapshot.timeline, snapshot.streamingItems),
    [snapshot.timeline, snapshot.streamingItems]
  )

  useEffect(() => {
    const sources: RealtimeMarkdownWriteSource[] = []

    for (const item of timelineWithStreaming) {
      if (item.type !== 'text_editor') {
        continue
      }

      const isExistingRealtimeWrite = hasRealtimeMarkdownWriteOperation(item.id)
      const itemToolName = 'toolName' in item ? item.toolName : undefined
      const shouldTrackOperation =
        itemToolName === REALTIME_MARKDOWN_WRITE_TOOL_NAME ||
        PULSE_ONLY_TOOL_NAMES.has(itemToolName ?? '') ||
        isExistingRealtimeWrite

      if (!shouldTrackOperation) {
        continue
      }

      if (!item.path.toLowerCase().endsWith('.md')) {
        continue
      }

      if (item.status !== 'executing' && !isExistingRealtimeWrite) {
        continue
      }

      const isWriteFile =
        itemToolName === REALTIME_MARKDOWN_WRITE_TOOL_NAME || hasDetachedRealtimeMarkdownWriteOperation(item.id)
      const animationKey = item.animationKey ?? item.path
      const resolved = root ? resolveWorkspacePath(root, animationKey) : null
      const showDetachedPreview = isWriteFile && item.command === 'create'

      sources.push({
        toolCallId: item.id,
        path: item.path,
        animationKey,
        markdownBody: showDetachedPreview ? (item.markdownBody ?? '') : '',
        minimumVisibleMs: item.command === 'view' ? VIEW_ACTIVITY_MIN_VISIBLE_MS : 0,
        showDetachedPreview,
        status: item.status,
        nodeId: resolved?.nodeId,
        canvasId: resolved?.canvasId,
      })
    }

    syncRealtimeMarkdownWriteSources(sources)
    tickRealtimeMarkdownWrites()
  }, [root, timelineWithStreaming])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      tickRealtimeMarkdownWrites()
    }, REALTIME_MD_WRITE_TICK_MS)

    return () => {
      window.clearInterval(intervalId)
      clearRealtimeMarkdownWrites()
    }
  }, [])

  return null
})
