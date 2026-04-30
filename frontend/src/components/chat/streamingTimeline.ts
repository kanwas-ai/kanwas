import type {
  AskQuestionItem,
  ChatItem,
  ConversationItem,
  ProgressItem,
  ReportOutputItem,
  TextEditorItem,
  ThinkingItem,
  WebFetchItem,
  WebSearchItem,
} from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import type { ChatState, StreamingData } from '@/providers/chat'
import { filterDuplicateWorkingContext } from '@/utils/filterTimeline'

type TimelineConversationItem = DeepReadonly<ConversationItem>

type StreamingThinkingItem = ThinkingItem & { streaming: true }
type StreamingChatItem = ChatItem & { streaming: true }
type StreamingProgressItem = ProgressItem & { streaming: true }
type StreamingWebSearchItem = WebSearchItem & { streaming: true }
type StreamingWebFetchItem = WebFetchItem & { streaming: true }
type StreamingTextEditorItem = TextEditorItem & {
  streaming: true
  toolName?: StreamingData['toolName']
}
type StreamingReportOutputItem = ReportOutputItem & { streaming: true }
type StreamingAskQuestionItem = AskQuestionItem & { streaming: true }

function isTextEditorCommand(command: string | undefined): command is TextEditorItem['command'] {
  return (
    command === 'view' ||
    command === 'create' ||
    command === 'str_replace' ||
    command === 'insert' ||
    command === 'delete'
  )
}

export type TimelineWithStreamingItem =
  | TimelineConversationItem
  | StreamingChatItem
  | StreamingThinkingItem
  | StreamingProgressItem
  | StreamingWebSearchItem
  | StreamingWebFetchItem
  | StreamingTextEditorItem
  | StreamingReportOutputItem
  | StreamingAskQuestionItem

export function isStreamingTimelineItem(
  item: TimelineWithStreamingItem
): item is Exclude<TimelineWithStreamingItem, TimelineConversationItem> {
  return 'streaming' in item && item.streaming === true
}

export function buildStreamingTimelineItem(itemId: string, data: StreamingData): TimelineWithStreamingItem | null {
  switch (data.type) {
    case 'chat':
      return {
        id: itemId,
        type: 'chat',
        message: data.text,
        streaming: true,
        timestamp: data.lastUpdated,
      } as StreamingChatItem

    case 'thinking':
      return {
        id: itemId,
        type: 'thinking',
        thought: data.text,
        streaming: true,
        timestamp: data.lastUpdated,
      } as StreamingThinkingItem

    case 'progress':
      return {
        id: itemId,
        type: 'progress',
        message: data.text,
        streaming: true,
        timestamp: data.lastUpdated,
      } as StreamingProgressItem

    case 'report_output':
      return {
        id: itemId,
        type: 'report_output',
        subagentId: data.subagentId || '',
        content: data.text,
        lineCount: data.lineCount,
        status: 'streaming',
        streaming: true,
        timestamp: data.lastUpdated,
      } as StreamingReportOutputItem

    case 'tool':
      if (data.toolName === 'web_search' && data.objective) {
        return {
          id: itemId,
          type: 'web_search',
          objective: data.objective,
          status: 'searching',
          streaming: true,
          timestamp: data.lastUpdated,
        } as StreamingWebSearchItem
      }

      if (data.toolName === 'web_fetch') {
        return {
          id: itemId,
          type: 'web_fetch',
          urls: [...(data.urls ?? [])],
          objective: data.objective || undefined,
          status: 'fetching',
          streaming: true,
          timestamp: data.lastUpdated,
        } as StreamingWebFetchItem
      }

      if (
        (data.toolName === 'str_replace_based_edit_tool' ||
          data.toolName === 'read_file' ||
          data.toolName === 'write_file' ||
          data.toolName === 'edit_file' ||
          data.toolName === 'delete_file') &&
        data.filePath
      ) {
        return {
          id: itemId,
          type: 'text_editor',
          toolName: data.toolName,
          path: data.filePath,
          animationKey: data.animationKey,
          markdownBody: data.markdownBody,
          command: isTextEditorCommand(data.command) ? data.command : 'view',
          status: 'executing',
          totalLines: data.lineCount,
          streaming: true,
          timestamp: data.lastUpdated,
        } as StreamingTextEditorItem
      }

      if (data.toolName === 'ask_question') {
        return {
          id: itemId,
          type: 'ask_question',
          context: data.text || undefined,
          questions: [],
          status: 'pending',
          streaming: true,
          timestamp: data.lastUpdated,
          agent: { source: 'main' },
        } as StreamingAskQuestionItem
      }

      return null
  }
}

export function mergeTimelineWithStreaming(
  timeline: readonly TimelineConversationItem[],
  streamingItems: Readonly<ChatState['streamingItems']>
): TimelineWithStreamingItem[] {
  const filteredTimeline = filterDuplicateWorkingContext(timeline)
  const streamingIds = new Set(Object.keys(streamingItems))
  const nonStreamingItems = filteredTimeline.filter((item) => !streamingIds.has(item.id))
  const syntheticStreamingItems = Object.entries(streamingItems)
    .map(([itemId, data]) => buildStreamingTimelineItem(itemId, data))
    .filter((item): item is TimelineWithStreamingItem => item !== null)

  return [...nonStreamingItems, ...syntheticStreamingItems]
}
