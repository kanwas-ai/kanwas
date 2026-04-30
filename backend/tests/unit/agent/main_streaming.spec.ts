import { test } from '@japa/runner'
import { EventStream, State, type AgentEvent, type ThinkingItem } from '#agent/index'
import { createMainToolLoopStreamingHandlers } from '#agent/llm/main_streaming'

function createHarness(providerName: 'anthropic' | 'openai' = 'anthropic') {
  const eventStream = new EventStream()
  const state = new State(eventStream)
  const events: AgentEvent[] = []
  const writes: Array<{ path: string; content: string }> = []
  const commands: string[] = []
  const existingFiles = new Set<string>()

  eventStream.on('agent_event', (event: AgentEvent) => {
    events.push(event)
  })

  const sandboxManager = {
    fileExists: async (path: string) => existingFiles.has(path),
    writeFile: async (path: string, content: string) => {
      writes.push({ path, content })
      existingFiles.add(path)
    },
    exec: async (command: string) => {
      commands.push(command)
      return { stdout: '', stderr: '', exitCode: 0 }
    },
  }

  const handlers = createMainToolLoopStreamingHandlers({ state, eventStream, providerName, sandboxManager } as any)

  return { handlers, events, state, writes, commands }
}

test.group('main streaming non-ask tools', () => {
  test('streams Anthropic text as live chat', ({ assert }) => {
    const { handlers, events } = createHarness('anthropic')

    handlers.onChunk({ type: 'text-start', id: 'text_1' })
    handlers.onChunk({ type: 'text-delta', id: 'text_1', text: 'Hello' })
    handlers.onChunk({ type: 'text-delta', id: 'text_1', text: ' world' })
    handlers.onChunk({ type: 'text-end', id: 'text_1' })

    const chatEvents = events.filter((event) => event.type === 'chat_streaming')
    const chatTexts = chatEvents.map((event) => (event.type === 'chat_streaming' ? event.streamingText : undefined))

    assert.equal(chatTexts.length, 2)
    assert.equal(chatTexts[0], 'Hello')
    assert.equal(chatTexts[1], 'Hello world')
  })

  test('flushes streamed chat into the canonical timeline before a tool starts', ({ assert }) => {
    const { handlers, events, state } = createHarness('anthropic')

    handlers.onChunk({ type: 'text-start', id: 'text_1' })
    handlers.onChunk({ type: 'text-delta', id: 'text_1', text: "I've got your context loaded." })

    const streamedItemId = handlers.getTextOutputItemId()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_1', toolName: 'ask_question' })

    const chatItem = state.getTimeline().find((item) => item.type === 'chat')
    assert.exists(chatItem)
    assert.equal(chatItem?.id, streamedItemId)
    assert.equal(chatItem?.type === 'chat' ? chatItem.message : undefined, "I've got your context loaded.")
    assert.equal(handlers.getBufferedChatText(), '')
    assert.isTrue(handlers.hasPersistedChatSegments())

    const chatEventIndex = events.findIndex((event) => event.type === 'chat' && event.itemId === streamedItemId)
    const toolEventIndex = events.findIndex((event) => event.type === 'tool_streaming' && event.itemId === 'ask_1')

    assert.isAtLeast(chatEventIndex, 0)
    assert.isAtLeast(toolEventIndex, 0)
    assert.isBelow(chatEventIndex, toolEventIndex)
  })

  test('routes OpenAI commentary text to progress lane', ({ assert }) => {
    const { handlers, events, state } = createHarness('openai')

    handlers.onChunk({
      type: 'text-start',
      id: 'commentary_1',
      providerMetadata: { openai: { phase: 'commentary' } },
    })
    handlers.onChunk({
      type: 'text-delta',
      id: 'commentary_1',
      text: 'Reading the config first.',
    })
    handlers.onChunk({
      type: 'text-end',
      id: 'commentary_1',
      providerMetadata: { openai: { phase: 'commentary' } },
    })

    const progressEvents = events.filter((event) => event.type === 'progress_streaming')
    const progressTexts = progressEvents.map((event) =>
      event.type === 'progress_streaming' ? event.streamingText : undefined
    )

    assert.deepEqual(progressTexts, ['Reading the config first.'])

    const progressItems = state.getTimeline().filter((item) => item.type === 'progress')
    assert.equal(progressItems.length, 1)
    assert.equal((progressItems[0] as any).message, 'Reading the config first.')
  })

  test('routes OpenAI final answer text to live chat lane', ({ assert }) => {
    const { handlers, events, state } = createHarness('openai')

    handlers.onChunk({
      type: 'text-start',
      id: 'final_1',
      providerMetadata: { openai: { phase: 'final_answer' } },
    })
    handlers.onChunk({
      type: 'text-delta',
      id: 'final_1',
      text: 'The fix is in place.',
    })
    handlers.onChunk({
      type: 'text-end',
      id: 'final_1',
      providerMetadata: { openai: { phase: 'final_answer' } },
    })

    const chatEvents = events.filter((event) => event.type === 'chat_streaming')
    assert.equal(chatEvents.length, 1)
    assert.equal(chatEvents[0]?.itemId, handlers.getTextOutputItemId())
    assert.equal(
      chatEvents[0]?.type === 'chat_streaming' ? chatEvents[0].streamingText : undefined,
      'The fix is in place.'
    )

    const progressItems = state.getTimeline().filter((item) => item.type === 'progress')
    assert.equal(progressItems.length, 0)
  })

  test('streams progress updates from partial JSON', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'progress_1', toolName: 'progress' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'progress_1',
      delta: '{"message": "Analyzing workspace context',
    })

    const progressEvents = events.filter(
      (event) => event.type === 'progress_streaming' && event.itemId === 'progress_1'
    )
    const progressTexts = progressEvents.map((event) =>
      event.type === 'progress_streaming' ? event.streamingText : undefined
    )

    assert.equal(progressTexts.length, 2)
    assert.equal(progressTexts[0], '')
    assert.equal(progressTexts[1], 'Analyzing workspace context')
  })

  test('does not emit synthetic reposition placeholders from streamed or complete tool input', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'reposition_1', toolName: 'reposition_files' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'reposition_1',
      delta: '{"canvas":"docs","changes":[{"type":"move_files","sectionId":"section-1","paths":["docs/one.md"]}]}',
    })

    assert.notExists(
      events.find((event) => event.type === 'tool_streaming' && event.itemId === 'reposition_1'),
      'reposition_files should not create a placeholder from partial streamed input'
    )

    handlers.onChunk({
      type: 'tool-call',
      toolCallId: 'reposition_1',
      toolName: 'reposition_files',
      input: {
        canvas: 'docs',
        changes: [{ type: 'move_files', sectionId: 'section-1', paths: ['docs/one.md'] }],
      },
    })

    assert.notExists(
      events.find((event) => event.type === 'tool_streaming' && event.itemId === 'reposition_1'),
      'reposition_files should not create a placeholder from complete streamed input'
    )
  })

  test('creates a failed reposition_files item from pre-execute tool errors', ({ assert }) => {
    const { handlers, events, state } = createHarness()

    handlers.onChunk({
      type: 'tool-error',
      toolCallId: 'reposition_1',
      toolName: 'reposition_files',
      error:
        'create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.',
    })

    const item = state.findTimelineItem('reposition_1')
    assert.deepInclude(item as object, {
      type: 'reposition_files',
      paths: [],
      status: 'failed',
      rawError:
        'create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.',
    })
    assert.equal(events.at(-1)?.type, 'reposition_files_failed')
    assert.equal(events.at(-1)?.itemId, 'reposition_1')
  })

  test('updates an existing reposition_files item from pre-execute tool errors', ({ assert }) => {
    const { handlers, state } = createHarness()

    state.addTimelineItem(
      {
        type: 'reposition_files',
        paths: ['docs/one.md'],
        status: 'executing',
        timestamp: Date.now(),
      },
      'reposition_files_started',
      'reposition_1'
    )

    handlers.onChunk({
      type: 'tool-error',
      toolCallId: 'reposition_1',
      toolName: 'reposition_files',
      error: 'Invalid tool input',
    })

    const items = state.getTimeline().filter((item) => item.type === 'reposition_files')
    assert.equal(items.length, 1)
    assert.deepInclude(items[0], {
      id: 'reposition_1',
      type: 'reposition_files',
      paths: [],
      status: 'failed',
      rawError: 'Invalid tool input',
    })
  })

  test('emits text editor patch payload while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'edit_1',
      toolName: 'str_replace_based_edit_tool',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'edit_1',
      delta: '{"command":"create","path":"/workspace/notes.md","file_text":"line 1\\nline 2"}',
    })

    const editEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'edit_1' &&
        event.toolPatch.set?.toolName === 'str_replace_based_edit_tool' &&
        event.toolPatch.set?.filePath === '/workspace/notes.md'
    )

    assert.exists(editEvent)
    if (editEvent?.type === 'tool_streaming') {
      assert.deepEqual(editEvent.toolPatch, {
        set: {
          toolName: 'str_replace_based_edit_tool',
          filePath: '/workspace/notes.md',
          command: 'create',
          lineCount: 2,
        },
      })
    }
  })

  test('emits write_file payload from file input while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'write_1',
      toolName: 'write_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'write_1',
      delta:
        '{"path":"notes.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240},"content":"line 1\nline 2"',
    })

    const writeEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'write_1' &&
        event.toolPatch.set?.toolName === 'write_file' &&
        event.toolPatch.set?.filePath === '/workspace/notes.md'
    )

    assert.exists(writeEvent)
    if (writeEvent?.type === 'tool_streaming') {
      assert.deepEqual(writeEvent.toolPatch, {
        set: {
          toolName: 'write_file',
          filePath: '/workspace/notes.md',
          animationKey: '/workspace/notes.md',
          markdownAppend: 'line 1\nline 2',
          command: 'create',
          lineCount: 2,
        },
      })
    }
  })

  test('emits incremental markdown appends for write_file streams', ({ assert }) => {
    const { handlers, events } = createHarness('openai')
    const originalNow = Date.now
    let now = 1_000

    Date.now = () => now

    try {
      handlers.onChunk({
        type: 'tool-input-start',
        id: 'write_2',
        toolName: 'write_file',
      })
      handlers.onChunk({
        type: 'tool-input-delta',
        id: 'write_2',
        delta:
          '{"path":"notes.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240},"content":"# Title',
      })

      now += 200

      handlers.onChunk({
        type: 'tool-input-delta',
        id: 'write_2',
        delta: '\n\nBody',
      })
    } finally {
      Date.now = originalNow
    }

    const writeEvents = events.filter(
      (event) =>
        event.type === 'tool_streaming' && event.itemId === 'write_2' && event.toolPatch.set?.toolName === 'write_file'
    )

    assert.lengthOf(writeEvents, 3)

    const deltaEvents = writeEvents.slice(1)
    assert.deepEqual(
      deltaEvents.map((event) => (event.type === 'tool_streaming' ? event.toolPatch.set?.markdownAppend : undefined)),
      ['# Title', '\n\nBody']
    )
  })

  test('creates a markdown placeholder as soon as path and section are both complete', async ({ assert }) => {
    const { handlers, writes, commands } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'write_placeholder',
      toolName: 'write_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'write_placeholder',
      delta:
        '{"path":"notes.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240},"content":"# Title',
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/notes.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/notes.md', content: '' },
    ])
    assert.deepEqual(commands, ["mkdir -p '/workspace'", "mkdir -p '/tmp/kanwas-placement'"])
  })

  test('creates a markdown placeholder when section completes before content', async ({ assert }) => {
    const { handlers, writes } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'write_out_of_order',
      toolName: 'write_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'write_out_of_order',
      delta: '{"path":"notes.md","section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}',
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(writes, [
      {
        path: '/tmp/kanwas-placement/notes.md.json',
        content: '{"section":{"mode":"create","title":"Overview","layout":"horizontal","x":120,"y":240}}',
      },
      { path: '/workspace/notes.md', content: '' },
    ])
  })

  test('does not create a join placeholder during streaming before the live section exists', async ({ assert }) => {
    const { handlers, writes, commands } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'write_join_wait',
      toolName: 'write_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'write_join_wait',
      delta: '{"path":"notes.md","section":{"mode":"join","title":"Overview"},"content":"# Title',
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.lengthOf(writes, 0)
    assert.isTrue(commands.some((command) => command.includes('/sections/wait')))
  })

  test('emits edit_file payload while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'edit_file_1',
      toolName: 'edit_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'edit_file_1',
      delta: '{"path":"notes.md","mode":"insert_after","anchor_text":"# Title\\n","new_text":"New line\\n"}',
    })

    const editEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'edit_file_1' &&
        event.toolPatch.set?.toolName === 'edit_file' &&
        event.toolPatch.set?.filePath === '/workspace/notes.md'
    )

    assert.exists(editEvent)
    if (editEvent?.type === 'tool_streaming') {
      assert.deepEqual(editEvent.toolPatch, {
        set: {
          toolName: 'edit_file',
          filePath: '/workspace/notes.md',
          command: 'insert',
          lineCount: 1,
        },
      })
    }
  })

  test('emits replace_entire edit_file payload as a rewrite while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness('openai')

    handlers.onChunk({
      type: 'tool-input-start',
      id: 'edit_file_2',
      toolName: 'edit_file',
    })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'edit_file_2',
      delta: '{"path":"notes.md","mode":"replace_entire","new_text":"# Rewritten\\n\\nBody\\n"}',
    })

    const editEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'edit_file_2' &&
        event.toolPatch.set?.toolName === 'edit_file' &&
        event.toolPatch.set?.filePath === '/workspace/notes.md'
    )

    assert.exists(editEvent)
    if (editEvent?.type === 'tool_streaming') {
      assert.deepEqual(editEvent.toolPatch, {
        set: {
          toolName: 'edit_file',
          filePath: '/workspace/notes.md',
          command: 'str_replace',
          lineCount: 3,
        },
      })
    }
  })

  test('emits web_search objective patch while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'web_1', toolName: 'web_search' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'web_1',
      delta: '{"objective": "retention benchmark 2026"}',
    })

    const webSearchEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'web_1' &&
        event.toolPatch.set?.toolName === 'web_search' &&
        event.toolPatch.set?.objective === 'retention benchmark 2026'
    )

    assert.exists(webSearchEvent)
    if (webSearchEvent?.type === 'tool_streaming') {
      assert.deepEqual(webSearchEvent.toolPatch, {
        set: {
          toolName: 'web_search',
          objective: 'retention benchmark 2026',
        },
      })
    }
  })

  test('emits web_fetch urls and objective patch while arguments stream', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'fetch_1', toolName: 'web_fetch' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'fetch_1',
      delta: '{"urls":["https://www.producthunt.com","https://www.reddit.com"],"objective":"launch feedback summary"}',
    })

    const webFetchEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'fetch_1' &&
        event.toolPatch.set?.toolName === 'web_fetch' &&
        Array.isArray(event.toolPatch.set?.urls)
    )

    assert.exists(webFetchEvent)
    if (webFetchEvent?.type === 'tool_streaming') {
      assert.deepEqual(webFetchEvent.toolPatch, {
        set: {
          toolName: 'web_fetch',
          urls: ['https://www.producthunt.com', 'https://www.reddit.com'],
          objective: 'launch feedback summary',
        },
      })
    }
  })

  test('creates separate thinking items for consecutive reasoning blocks', ({ assert }) => {
    const { handlers, events, state } = createHarness()

    handlers.onChunk({ type: 'reasoning-delta', text: 'First thought' })
    handlers.onChunk({ type: 'reasoning-end' })
    handlers.onChunk({ type: 'reasoning-delta', text: 'Second thought' })
    handlers.onChunk({ type: 'reasoning-end' })

    const thinkingEvents = events.filter((event) => event.type === 'thinking_streaming')
    const thinkingItemIds = thinkingEvents.map((event) => event.itemId)

    assert.equal(thinkingEvents.length, 2)
    assert.notEqual(thinkingItemIds[0], thinkingItemIds[1])

    const thinkingItems = state.getTimeline().filter((item): item is ThinkingItem => item.type === 'thinking')

    assert.equal(thinkingItems.length, 2)
    assert.deepEqual(
      thinkingItems.map((item) => ({
        id: item.id,
        thought: item.thought,
        streaming: item.streaming,
      })),
      [
        { id: thinkingItemIds[0], thought: 'First thought', streaming: false },
        { id: thinkingItemIds[1], thought: 'Second thought', streaming: false },
      ]
    )
  })
})

test.group('main streaming ask_question', () => {
  test('emits tool name patch on tool-input-start', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_start', toolName: 'ask_question' })

    const startEvent = events[0]
    assert.equal(startEvent?.type, 'tool_streaming')
    assert.equal(startEvent?.itemId, 'ask_start')

    if (startEvent?.type === 'tool_streaming') {
      assert.deepEqual(startEvent.toolPatch, {
        set: {
          toolName: 'ask_question',
        },
      })
    }
  })

  test('emits context markdown from partial ask_question JSON', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_1', toolName: 'ask_question' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'ask_1',
      delta: '{"context": "## Clarifying context\\n- Checkout rollback"',
    })

    const contextEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'ask_1' &&
        event.toolPatch.set?.toolName === 'ask_question' &&
        typeof event.toolPatch.set?.text === 'string'
    )

    assert.exists(contextEvent)
    assert.equal(
      contextEvent?.type === 'tool_streaming' ? contextEvent.toolPatch.set?.text : undefined,
      '## Clarifying context\n- Checkout rollback'
    )
  })

  test('emits question generation stage once when questions key appears', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_2', toolName: 'ask_question' })
    handlers.onChunk({ type: 'tool-input-delta', id: 'ask_2', delta: '{"context": "Scope", "questions":' })
    handlers.onChunk({ type: 'tool-input-delta', id: 'ask_2', delta: '[{"id":"q1"}]' })
    handlers.onChunk({ type: 'tool-input-delta', id: 'ask_2', delta: '}' })

    const phaseEvents = events.filter(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'ask_2' &&
        event.toolPatch.set?.toolName === 'ask_question' &&
        event.toolPatch.set?.phase === 'question_generation'
    )

    assert.equal(phaseEvents.length, 1)
  })

  test('handles escaped markdown/newlines while streaming context', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_3', toolName: 'ask_question' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'ask_3',
      delta: '{"context": "### Constraints\\n\\n- Keep \\\"billing\\\" wording\\n- Path: C:\\\\workspace\\\\notes"',
    })

    const contextEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'ask_3' &&
        event.toolPatch.set?.toolName === 'ask_question' &&
        typeof event.toolPatch.set?.text === 'string'
    )

    assert.exists(contextEvent)
    assert.equal(
      contextEvent?.type === 'tool_streaming' ? contextEvent.toolPatch.set?.text : undefined,
      '### Constraints\n\n- Keep "billing" wording\n- Path: C:\\workspace\\notes'
    )
  })

  test('does not emit question generation phase from quoted context text', ({ assert }) => {
    const { handlers, events } = createHarness()

    handlers.onChunk({ type: 'tool-input-start', id: 'ask_4', toolName: 'ask_question' })
    handlers.onChunk({
      type: 'tool-input-delta',
      id: 'ask_4',
      delta: '{"context": "Literal \\\"questions\\\": [] appears in context"',
    })

    const phaseEvent = events.find(
      (event) =>
        event.type === 'tool_streaming' &&
        event.itemId === 'ask_4' &&
        event.toolPatch.set?.phase === 'question_generation'
    )

    assert.isUndefined(phaseEvent)
  })
})
