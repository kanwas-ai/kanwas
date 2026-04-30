import { describe, expect, it } from 'vitest'
import type { ConversationItem } from 'backend/agent'
import type { StreamingData } from '@/providers/chat'
import { buildStreamingTimelineItem, isStreamingTimelineItem } from '@/components/chat/streamingTimeline'

function createToolStreamingData(overrides: Partial<StreamingData>): StreamingData {
  return {
    type: 'tool',
    text: '',
    lastUpdated: Date.now(),
    ...overrides,
  }
}

describe('streaming timeline mapping', () => {
  it('maps chat streaming into a synthetic chat item', () => {
    const item = buildStreamingTimelineItem('chat_stream_1', {
      type: 'chat',
      text: 'Streaming answer',
      lastUpdated: Date.now(),
    })

    expect(item).toMatchObject({
      id: 'chat_stream_1',
      type: 'chat',
      message: 'Streaming answer',
      streaming: true,
    })
  })

  it('maps web search tool streaming into a synthetic web_search item', () => {
    const item = buildStreamingTimelineItem(
      'tool_web_1',
      createToolStreamingData({
        toolName: 'web_search',
        objective: 'state management benchmarks',
      })
    )

    expect(item).toMatchObject({
      id: 'tool_web_1',
      type: 'web_search',
      objective: 'state management benchmarks',
      status: 'searching',
      streaming: true,
    })
  })

  it('maps text editor tool streaming metadata', () => {
    const item = buildStreamingTimelineItem(
      'tool_edit_1',
      createToolStreamingData({
        toolName: 'str_replace_based_edit_tool',
        filePath: '/workspace/summary.md',
        command: 'insert',
        lineCount: 7,
      })
    )

    expect(item).toMatchObject({
      id: 'tool_edit_1',
      type: 'text_editor',
      path: '/workspace/summary.md',
      command: 'insert',
      status: 'executing',
      totalLines: 7,
      streaming: true,
    })
  })

  it('maps delete file streaming metadata into a text editor item', () => {
    const item = buildStreamingTimelineItem(
      'tool_delete_1',
      createToolStreamingData({
        toolName: 'str_replace_based_edit_tool',
        filePath: '/workspace/old-notes.md',
        command: 'delete',
      })
    )

    expect(item).toMatchObject({
      id: 'tool_delete_1',
      type: 'text_editor',
      path: '/workspace/old-notes.md',
      command: 'delete',
      status: 'executing',
      streaming: true,
    })
  })

  it('maps write_file streaming metadata into a text editor item', () => {
    const item = buildStreamingTimelineItem(
      'tool_write_1',
      createToolStreamingData({
        toolName: 'write_file',
        filePath: '/workspace/notes.md',
        animationKey: '/workspace/notes.md',
        markdownBody: 'line 1\nline 2',
        command: 'create',
        lineCount: 2,
      })
    )

    expect(item).toMatchObject({
      id: 'tool_write_1',
      type: 'text_editor',
      path: '/workspace/notes.md',
      animationKey: '/workspace/notes.md',
      markdownBody: 'line 1\nline 2',
      command: 'create',
      status: 'executing',
      totalLines: 2,
      streaming: true,
    })
  })

  it('maps edit_file streaming metadata into a text editor item', () => {
    const item = buildStreamingTimelineItem(
      'tool_edit_file_1',
      createToolStreamingData({
        toolName: 'edit_file',
        filePath: '/workspace/notes.md',
        command: 'insert',
        lineCount: 1,
      })
    )

    expect(item).toMatchObject({
      id: 'tool_edit_file_1',
      type: 'text_editor',
      path: '/workspace/notes.md',
      command: 'insert',
      status: 'executing',
      totalLines: 1,
      streaming: true,
    })
  })

  it('ignores reposition_files streaming patches because canonical timeline items own display state', () => {
    const item = buildStreamingTimelineItem(
      'tool_reposition_1',
      createToolStreamingData({
        toolName: 'reposition_files',
      })
    )

    expect(item).toBeNull()
  })

  it('maps ask question streaming context into a synthetic ask_question item', () => {
    const item = buildStreamingTimelineItem(
      'tool_ask_1',
      createToolStreamingData({
        toolName: 'ask_question',
        text: '## Clarifying context\n- Choose rollout strategy',
      })
    )

    expect(item).toMatchObject({
      id: 'tool_ask_1',
      type: 'ask_question',
      context: '## Clarifying context\n- Choose rollout strategy',
      status: 'pending',
      streaming: true,
    })
  })

  it('returns null when tool stream does not have enough data to map', () => {
    const webSearchWithoutQuery = buildStreamingTimelineItem(
      'tool_web_missing',
      createToolStreamingData({
        toolName: 'web_search',
      })
    )

    expect(webSearchWithoutQuery).toBeNull()
  })

  it('identifies synthetic streaming items', () => {
    const streamingItem = buildStreamingTimelineItem('progress_1', {
      type: 'progress',
      text: 'Analyzing repo',
      lastUpdated: Date.now(),
    })

    const regularItem: ConversationItem = {
      id: 'chat_1',
      type: 'chat',
      message: 'Done',
      timestamp: Date.now(),
    }

    expect(streamingItem).not.toBeNull()
    if (!streamingItem) {
      throw new Error('Expected streaming item to be created')
    }

    expect(isStreamingTimelineItem(streamingItem)).toBe(true)
    expect(isStreamingTimelineItem(regularItem)).toBe(false)
  })
})
