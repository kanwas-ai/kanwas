import type { AgentEvent } from 'backend/agent'
import type { ChatState } from './ChatContext'

type StreamingItem = ChatState['streamingItems'][string]
type StreamingToolData = Omit<StreamingItem, 'type'> & { type: 'tool' }

export function applyToolStreamingPatch(
  previous: StreamingItem | undefined,
  patch: Extract<AgentEvent, { type: 'tool_streaming' }>['toolPatch']
): StreamingToolData {
  const previousToolData = previous?.type === 'tool' ? previous : undefined

  const next: StreamingToolData = {
    type: 'tool',
    text: previousToolData?.text ?? '',
    toolName: previousToolData?.toolName,
    filePath: previousToolData?.filePath,
    urls: previousToolData?.urls,
    paths: previousToolData?.paths,
    animationKey: previousToolData?.animationKey,
    command: previousToolData?.command,
    markdownBody: previousToolData?.markdownBody,
    objective: previousToolData?.objective,
    lineCount: previousToolData?.lineCount,
    contentLength: previousToolData?.contentLength,
    phase: previousToolData?.phase,
    lastUpdated: Date.now(),
  }

  for (const field of patch.clear || []) {
    switch (field) {
      case 'text':
        next.text = ''
        break
      case 'toolName':
        delete next.toolName
        break
      case 'filePath':
        delete next.filePath
        break
      case 'urls':
        delete next.urls
        break
      case 'paths':
        delete next.paths
        break
      case 'animationKey':
        delete next.animationKey
        break
      case 'command':
        delete next.command
        break
      case 'markdownBody':
      case 'markdownAppend':
        delete next.markdownBody
        break
      case 'contentLength':
        delete next.contentLength
        break
      case 'lineCount':
        delete next.lineCount
        break
      case 'objective':
        delete next.objective
        break
      case 'phase':
        delete next.phase
        break
    }
  }

  const set = patch.set
  if (set) {
    if (set.text !== undefined) next.text = set.text
    if (set.toolName !== undefined) next.toolName = set.toolName
    if (set.filePath !== undefined) next.filePath = set.filePath
    if (set.urls !== undefined) next.urls = set.urls
    if (set.paths !== undefined) next.paths = set.paths
    if (set.animationKey !== undefined) next.animationKey = set.animationKey
    if (set.command !== undefined) next.command = set.command
    if (set.markdownBody !== undefined) next.markdownBody = set.markdownBody
    if (set.markdownAppend !== undefined) {
      next.markdownBody = `${next.markdownBody ?? ''}${set.markdownAppend}`
    }
    if (set.objective !== undefined) next.objective = set.objective
    if (set.lineCount !== undefined) next.lineCount = set.lineCount
    if (set.contentLength !== undefined) next.contentLength = set.contentLength
    if (set.phase !== undefined) next.phase = set.phase
  }

  return next
}

export function toStreamingPatch(
  event: AgentEvent,
  previous?: StreamingItem
): { itemId: string; data: StreamingItem } | null {
  const { type, itemId } = event

  switch (type) {
    case 'thinking_streaming':
      return {
        itemId,
        data: {
          type: 'thinking',
          text: event.streamingText || '',
          lastUpdated: Date.now(),
        },
      }

    case 'chat_streaming':
      return {
        itemId,
        data: {
          type: 'chat',
          text: event.streamingText || '',
          lastUpdated: Date.now(),
        },
      }

    case 'progress_streaming':
      return {
        itemId,
        data: {
          type: 'progress',
          text: event.streamingText || '',
          lastUpdated: Date.now(),
        },
      }

    case 'report_output_streaming':
      return {
        itemId,
        data: {
          type: 'report_output',
          text: event.reportOutputText || '',
          subagentId: event.subagentId,
          lineCount: event.lineCount,
          lastUpdated: Date.now(),
        },
      }

    case 'tool_streaming':
      return {
        itemId,
        data: applyToolStreamingPatch(previous, event.toolPatch),
      }

    default:
      return null
  }
}

export function getStreamingItemIdsToClear(
  event: AgentEvent,
  streamingItems: ChatState['streamingItems']
): 'all' | string[] {
  if (event.type === 'execution_completed' || event.type === 'execution_interrupted' || event.type === 'error') {
    return 'all'
  }

  const itemIds = new Set<string>()

  if (streamingItems[event.itemId]) {
    itemIds.add(event.itemId)
  }

  return [...itemIds]
}
