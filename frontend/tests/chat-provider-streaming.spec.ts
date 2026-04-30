import { describe, expect, it } from 'vitest'
import type { AgentEvent, ToolStreamingPatch } from 'backend/agent'
import { applyToolStreamingPatch, getStreamingItemIdsToClear, toStreamingPatch } from '@/providers/chat/streaming'

function createToolStreamingEvent(
  itemId: string,
  toolPatch: ToolStreamingPatch
): Extract<AgentEvent, { type: 'tool_streaming' }> {
  return {
    type: 'tool_streaming',
    itemId,
    timestamp: Date.now(),
    toolPatch,
  }
}

describe('chat streaming reducer', () => {
  it('applies web search tool patches across start and delta events', () => {
    const afterStart = applyToolStreamingPatch(undefined, {
      set: { toolName: 'web_search' },
    })

    const afterDelta = applyToolStreamingPatch(afterStart, {
      set: { query: 'retention benchmarks' },
    })

    expect(afterDelta).toMatchObject({
      type: 'tool',
      text: '',
      toolName: 'web_search',
      query: 'retention benchmarks',
    })
  })

  it('applies text editor streaming metadata patches', () => {
    const afterStart = applyToolStreamingPatch(undefined, {
      set: { toolName: 'str_replace_based_edit_tool' },
    })

    const afterDelta = applyToolStreamingPatch(afterStart, {
      set: {
        filePath: '/workspace/notes.md',
        command: 'create',
        lineCount: 12,
      },
    })

    expect(afterDelta).toMatchObject({
      type: 'tool',
      toolName: 'str_replace_based_edit_tool',
      filePath: '/workspace/notes.md',
      command: 'create',
      lineCount: 12,
    })
  })

  it('accumulates incremental markdown body patches for write_file', () => {
    const afterStart = applyToolStreamingPatch(undefined, {
      set: { toolName: 'write_file' },
    })

    const afterFirstDelta = applyToolStreamingPatch(afterStart, {
      set: {
        filePath: '/workspace/notes.md',
        animationKey: '/workspace/notes.md',
        markdownAppend: '# Title\n',
      },
    })

    const afterSecondDelta = applyToolStreamingPatch(afterFirstDelta, {
      set: {
        markdownAppend: '\nBody',
      },
    })

    expect(afterSecondDelta).toMatchObject({
      type: 'tool',
      toolName: 'write_file',
      filePath: '/workspace/notes.md',
      animationKey: '/workspace/notes.md',
      markdownBody: '# Title\n\nBody',
    })
  })

  it('supports explicit clear semantics when switching tools', () => {
    const previous = {
      type: 'tool' as const,
      text: 'old text',
      toolName: 'web_search',
      query: 'stale query',
      lineCount: 3,
      lastUpdated: 1,
    }

    const next = applyToolStreamingPatch(previous, {
      clear: ['query', 'lineCount', 'text'],
      set: {
        toolName: 'ask_question',
        text: '## Clarifying context',
        phase: 'question_generation',
      },
    })

    expect(next).toMatchObject({
      type: 'tool',
      toolName: 'ask_question',
      text: '## Clarifying context',
      phase: 'question_generation',
    })
    expect(next.query).toBeUndefined()
    expect(next.lineCount).toBeUndefined()
  })

  it('maps progress and report streaming events', () => {
    const chatEvent: AgentEvent = {
      type: 'chat_streaming',
      itemId: 'chat_1',
      timestamp: Date.now(),
      streamingText: 'Streaming answer',
    }

    const chatPatch = toStreamingPatch(chatEvent)
    expect(chatPatch).toMatchObject({
      itemId: 'chat_1',
      data: {
        type: 'chat',
        text: 'Streaming answer',
      },
    })

    const progressEvent: AgentEvent = {
      type: 'progress_streaming',
      itemId: 'progress_1',
      timestamp: Date.now(),
      streamingText: 'Reading files',
    }

    const progressPatch = toStreamingPatch(progressEvent)
    expect(progressPatch).toMatchObject({
      itemId: 'progress_1',
      data: {
        type: 'progress',
        text: 'Reading files',
      },
    })

    const reportEvent: AgentEvent = {
      type: 'report_output_streaming',
      itemId: 'report_1',
      timestamp: Date.now(),
      reportOutputText: 'line 1\nline 2',
      subagentId: 'subagent_1',
      lineCount: 2,
    }

    const reportPatch = toStreamingPatch(reportEvent)
    expect(reportPatch).toMatchObject({
      itemId: 'report_1',
      data: {
        type: 'report_output',
        text: 'line 1\nline 2',
        subagentId: 'subagent_1',
        lineCount: 2,
      },
    })
  })

  it('returns null for non-streaming events', () => {
    const event: AgentEvent = {
      type: 'chat',
      itemId: 'chat_1',
      timestamp: Date.now(),
    }

    expect(toStreamingPatch(event)).toBeNull()
  })

  it('applies tool event patches through toStreamingPatch', () => {
    const previous = {
      type: 'tool' as const,
      text: '',
      toolName: 'web_search',
      query: 'stale',
      lastUpdated: 1,
    }

    const event = createToolStreamingEvent('tool_1', {
      clear: ['query'],
      set: {
        toolName: 'web_search',
        query: 'fresh query',
      },
    })

    const patch = toStreamingPatch(event, previous)

    expect(patch).toMatchObject({
      itemId: 'tool_1',
      data: {
        type: 'tool',
        toolName: 'web_search',
        query: 'fresh query',
      },
    })
  })

  it('clears the streaming item when the canonical item arrives', () => {
    const ids = getStreamingItemIdsToClear(
      {
        type: 'chat',
        itemId: 'todo_1',
        timestamp: Date.now(),
      },
      {
        todo_1: {
          type: 'tool',
          text: '',
          toolName: 'web_search',
          lastUpdated: 1,
        },
      }
    )

    expect(ids).toEqual(['todo_1'])
  })

  it('clears all streaming items when execution completes', () => {
    const ids = getStreamingItemIdsToClear(
      {
        type: 'execution_completed',
        itemId: 'done',
        timestamp: Date.now(),
      },
      {
        one: {
          type: 'tool',
          text: '',
          toolName: 'web_search',
          lastUpdated: 1,
        },
      }
    )

    expect(ids).toBe('all')
  })

  it('clears all streaming items when execution is interrupted', () => {
    const ids = getStreamingItemIdsToClear(
      {
        type: 'execution_interrupted',
        itemId: 'done',
        timestamp: Date.now(),
      },
      {
        one: {
          type: 'tool',
          text: '',
          toolName: 'str_replace_based_edit_tool',
          lastUpdated: 1,
        },
      }
    )

    expect(ids).toBe('all')
  })
})
