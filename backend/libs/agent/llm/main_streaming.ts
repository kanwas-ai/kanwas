import type { ToolContext } from '../tools/context.js'
import {
  clearWriteFileStreamingState,
  createRepositionFilesFailure,
  getWriteFilePreview,
  prepareWriteFileDuringStreaming,
} from '../tools/native_file_tools.js'
import { resolveWorkspaceFilePath } from '../tools/native_shared.js'
import type { ToolStreamingPatch } from '../types.js'
import { extractJsonStringArrayField, extractJsonStringField, hasJsonFieldStarted } from '../utils/json_streaming.js'

const STREAMING_TOOLS = new Set([
  'progress',
  'str_replace_based_edit_tool',
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'web_search',
  'web_fetch',
  'ask_question',
])
const STREAM_THROTTLE_MS = 150

type StreamingToolCall = {
  toolName: string
  argsText: string
  lastEmitTime: number
  lastWriteMarkdownBody?: string
  askQuestionContextStarted?: boolean
  askQuestionQuestionGenerationEmitted?: boolean
  lastAskQuestionContextText?: string
}

type OpenAITextPhase = 'commentary' | 'final_answer'
type TextLane = 'chat' | 'progress' | 'unknown'

type ActiveTextBlock = {
  lane: TextLane
  streamItemId: string
  text: string
}

type PendingTextBlock = {
  streamItemId: string
  text: string
}

export interface MainToolLoopStreamingHandlers {
  onChunk: (chunk: any) => void
  onError: () => void
  finalize: () => void
  getTextOutputItemId: () => string | undefined
  getBufferedChatText: () => string
  hasPersistedChatSegments: () => boolean
}

function emitToolStreamingPatch(context: ToolContext, itemId: string, patch: ToolStreamingPatch): void {
  context.eventStream.emitEvent({
    type: 'tool_streaming',
    itemId,
    timestamp: Date.now(),
    toolPatch: patch,
  })
}

function emitChatStreaming(context: ToolContext, itemId: string, text: string): void {
  context.eventStream.emitEvent({
    type: 'chat_streaming',
    itemId,
    timestamp: Date.now(),
    streamingText: text,
  })
}

function generateStreamingItemId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getStreamingChunkText(chunk: { text?: unknown; delta?: unknown }): string {
  if (typeof chunk.text === 'string') {
    return chunk.text
  }

  if (typeof chunk.delta === 'string') {
    return chunk.delta
  }

  return ''
}

function getOpenAITextPhase(providerMetadata: unknown): OpenAITextPhase | null {
  const phase = (providerMetadata as { openai?: { phase?: unknown } } | undefined)?.openai?.phase

  if (phase === 'commentary' || phase === 'final_answer') {
    return phase
  }

  return null
}

export function createMainToolLoopStreamingHandlers(context: ToolContext): MainToolLoopStreamingHandlers {
  const streamingToolCalls = new Map<string, StreamingToolCall>()
  const activeTextBlocks = new Map<string, ActiveTextBlock>()
  const pendingUnknownTextBlocks: PendingTextBlock[] = []
  let reasoningItemId: string | null = null
  let accumulatedReasoning = ''
  let chatText = ''
  let chatStreamItemId: string | undefined
  let persistedChatSegmentCount = 0

  const isOpenAI = context.providerName === 'openai'

  const getOrCreateChatStreamItemId = () => {
    if (!chatStreamItemId) {
      chatStreamItemId = generateStreamingItemId()
    }

    return chatStreamItemId
  }

  const emitProgressStreaming = (itemId: string, text: string) => {
    context.eventStream.emitEvent({
      type: 'progress_streaming',
      itemId,
      timestamp: Date.now(),
      streamingText: text,
    })
  }

  const appendChatText = (text: string) => {
    if (!text) {
      return
    }

    chatText += text
    emitChatStreaming(context, getOrCreateChatStreamItemId(), chatText)
  }

  const flushBufferedChatSegment = () => {
    if (!chatText || !chatStreamItemId) {
      return
    }

    context.state.addTimelineItem(
      {
        type: 'chat',
        message: chatText,
        timestamp: Date.now(),
      },
      'chat',
      chatStreamItemId
    )

    persistedChatSegmentCount += 1
    chatText = ''
    chatStreamItemId = undefined
  }

  const persistProgressItem = (itemId: string, text: string) => {
    if (!text) {
      return
    }

    context.state.addTimelineItem(
      {
        type: 'progress',
        message: text,
        streaming: false,
        timestamp: Date.now(),
        agent: { source: 'main' },
      },
      'progress',
      itemId
    )
  }

  const resolveInitialTextLane = (providerMetadata: unknown): TextLane => {
    if (!isOpenAI) {
      return 'chat'
    }

    const phase = getOpenAITextPhase(providerMetadata)
    if (phase === 'commentary') {
      return 'progress'
    }

    if (phase === 'final_answer') {
      return 'chat'
    }

    return 'unknown'
  }

  const flushPendingUnknownTextBlocks = (lane: Exclude<TextLane, 'unknown'>) => {
    if (pendingUnknownTextBlocks.length === 0) {
      return
    }

    const blocks = pendingUnknownTextBlocks.splice(0, pendingUnknownTextBlocks.length)
    if (lane === 'chat') {
      appendChatText(blocks.map((block) => block.text).join(''))
      return
    }

    for (const block of blocks) {
      persistProgressItem(block.streamItemId, block.text)
    }
  }

  const applyOpenAIPhaseToBlock = (block: ActiveTextBlock, providerMetadata: unknown) => {
    if (!isOpenAI || block.lane !== 'unknown') {
      return
    }

    const phase = getOpenAITextPhase(providerMetadata)
    if (phase === 'commentary') {
      block.lane = 'progress'
      emitProgressStreaming(block.streamItemId, block.text)
      return
    }

    if (phase === 'final_answer') {
      block.lane = 'chat'
      block.streamItemId = getOrCreateChatStreamItemId()
      appendChatText(block.text)
    }
  }

  const createTextBlock = (chunkId: string, providerMetadata: unknown) => {
    const lane = resolveInitialTextLane(providerMetadata)
    const block: ActiveTextBlock = {
      lane,
      streamItemId: lane === 'chat' ? getOrCreateChatStreamItemId() : generateStreamingItemId(),
      text: '',
    }

    activeTextBlocks.set(chunkId, block)
    return block
  }

  const getOrCreateTextBlock = (chunkId: string, providerMetadata: unknown) => {
    let block = activeTextBlocks.get(chunkId)
    if (!block) {
      block = createTextBlock(chunkId, providerMetadata)
    }

    applyOpenAIPhaseToBlock(block, providerMetadata)
    return block
  }

  const finalizeTextBlock = (block: ActiveTextBlock) => {
    if (!block.text) {
      return
    }

    if (block.lane === 'progress') {
      persistProgressItem(block.streamItemId, block.text)
      return
    }

    if (block.lane === 'unknown') {
      pendingUnknownTextBlocks.push({
        streamItemId: block.streamItemId,
        text: block.text,
      })
    }
  }

  const flushActiveUnknownTextBlocks = (lane: Exclude<TextLane, 'unknown'>) => {
    const unknownEntries = [...activeTextBlocks.entries()].filter(([, block]) => block.lane === 'unknown')
    if (unknownEntries.length === 0) {
      return
    }

    for (const [chunkId, block] of unknownEntries) {
      activeTextBlocks.delete(chunkId)
      if (!block.text) {
        continue
      }

      if (lane === 'chat') {
        appendChatText(block.text)
      } else {
        persistProgressItem(block.streamItemId, block.text)
      }
    }
  }

  const finalizeReasoning = () => {
    if (!reasoningItemId || !accumulatedReasoning) {
      return
    }

    const existingItem = context.state.findTimelineItem(reasoningItemId)
    if (existingItem && 'streaming' in existingItem && existingItem.streaming) {
      context.state.updateTimelineItem(reasoningItemId, { thought: accumulatedReasoning, streaming: false }, 'thinking')
    }

    reasoningItemId = null
    accumulatedReasoning = ''
  }

  return {
    onChunk: (chunk) => {
      if (chunk.type === 'text-start') {
        if (isOpenAI) {
          const phase = getOpenAITextPhase(chunk.providerMetadata)
          if (phase === 'commentary') {
            flushPendingUnknownTextBlocks('progress')
          } else if (phase === 'final_answer') {
            flushPendingUnknownTextBlocks('chat')
          }
        }

        createTextBlock(chunk.id, chunk.providerMetadata)
        return
      }

      if (chunk.type === 'text-delta') {
        const block = getOrCreateTextBlock(chunk.id, chunk.providerMetadata)
        const text = getStreamingChunkText(chunk)
        if (!text) {
          return
        }

        block.text += text

        if (block.lane === 'chat') {
          appendChatText(text)
          return
        }

        if (block.lane === 'progress') {
          emitProgressStreaming(block.streamItemId, block.text)
        }

        return
      }

      if (chunk.type === 'text-end') {
        const block = activeTextBlocks.get(chunk.id)
        if (!block) {
          return
        }

        applyOpenAIPhaseToBlock(block, chunk.providerMetadata)
        activeTextBlocks.delete(chunk.id)
        finalizeTextBlock(block)
        return
      }

      if (chunk.type === 'reasoning-delta') {
        const text = getStreamingChunkText(chunk)
        accumulatedReasoning += text

        if (!reasoningItemId) {
          reasoningItemId = context.state.addTimelineItem(
            {
              type: 'thinking',
              thought: text,
              streaming: true,
              timestamp: Date.now(),
              agent: { source: 'main' },
            },
            'thinking'
          )
        }

        context.eventStream.emitEvent({
          type: 'thinking_streaming',
          itemId: reasoningItemId,
          timestamp: Date.now(),
          streamingText: accumulatedReasoning,
        })
        return
      }

      if (chunk.type === 'tool-input-start') {
        if (isOpenAI) {
          flushActiveUnknownTextBlocks('progress')
          flushPendingUnknownTextBlocks('progress')
        }

        flushBufferedChatSegment()

        if (chunk.toolName !== 'reposition_files') {
          emitToolStreamingPatch(context, chunk.id, {
            set: {
              toolName: chunk.toolName,
            },
          })
        }

        if (STREAMING_TOOLS.has(chunk.toolName)) {
          streamingToolCalls.set(chunk.id, {
            toolName: chunk.toolName,
            argsText: '',
            lastEmitTime: 0,
          })

          if (chunk.toolName === 'progress') {
            emitProgressStreaming(chunk.id, '')
          }
        }
        return
      }

      if (chunk.type === 'tool-input-delta') {
        const tracking = streamingToolCalls.get(chunk.id)
        if (!tracking) {
          return
        }

        tracking.argsText += chunk.delta

        if (tracking.toolName === 'write_file') {
          prepareWriteFileDuringStreaming(context.sandboxManager, chunk.id, tracking.argsText)
        }

        const now = Date.now()

        switch (tracking.toolName) {
          case 'progress':
            handleProgressDelta(tracking, chunk.id, context)
            return

          case 'read_file':
          case 'str_replace_based_edit_tool':
          case 'write_file':
          case 'edit_file':
          case 'delete_file':
            if (now - tracking.lastEmitTime < STREAM_THROTTLE_MS) {
              return
            }
            tracking.lastEmitTime = now
            handleTextEditorDelta(tracking, chunk.id, context)
            return

          case 'web_search':
            if (now - tracking.lastEmitTime < STREAM_THROTTLE_MS) {
              return
            }
            tracking.lastEmitTime = now
            handleSearchDelta(tracking, chunk.id, context)
            return

          case 'web_fetch':
            if (now - tracking.lastEmitTime < STREAM_THROTTLE_MS) {
              return
            }
            tracking.lastEmitTime = now
            handleFetchDelta(tracking, chunk.id, context)
            return

          case 'ask_question':
            handleAskQuestionDelta(tracking, chunk.id, context, now)
            return
        }

        return
      }

      if (chunk.type === 'tool-call') {
        streamingToolCalls.delete(chunk.toolCallId)
        return
      }

      if (chunk.type === 'tool-error') {
        if (chunk.toolName === 'reposition_files') {
          handleRepositionToolError(chunk, context)
        }
        return
      }

      if (chunk.type === 'finish-step') {
        if (isOpenAI) {
          flushActiveUnknownTextBlocks('chat')
          flushPendingUnknownTextBlocks('chat')
        }
        return
      }

      if (chunk.type === 'reasoning-end') {
        finalizeReasoning()
      }
    },
    onError: () => {
      for (const [chunkId, tracking] of streamingToolCalls) {
        if (tracking.toolName === 'write_file') {
          clearWriteFileStreamingState(chunkId)
        }
      }

      streamingToolCalls.clear()
      activeTextBlocks.clear()
      pendingUnknownTextBlocks.splice(0, pendingUnknownTextBlocks.length)

      if (reasoningItemId) {
        context.state.updateTimelineItem(reasoningItemId, { streaming: false }, 'thinking')
        reasoningItemId = null
        accumulatedReasoning = ''
      }
    },
    finalize: () => {
      if (isOpenAI) {
        flushActiveUnknownTextBlocks('chat')
        flushPendingUnknownTextBlocks('chat')
      }

      for (const [chunkId, block] of activeTextBlocks) {
        activeTextBlocks.delete(chunkId)
        finalizeTextBlock(block)
      }

      for (const [chunkId, tracking] of streamingToolCalls) {
        if (tracking.toolName === 'write_file') {
          clearWriteFileStreamingState(chunkId)
        }
      }

      streamingToolCalls.clear()

      finalizeReasoning()
    },
    getTextOutputItemId: () => (chatText ? chatStreamItemId : undefined),
    getBufferedChatText: () => chatText,
    hasPersistedChatSegments: () => persistedChatSegmentCount > 0,
  }
}

function handleRepositionToolError(chunk: any, context: ToolContext): void {
  const toolCallId = typeof chunk.toolCallId === 'string' ? chunk.toolCallId : undefined
  if (!toolCallId) {
    return
  }

  const error = chunk.error ?? chunk.errorText ?? 'reposition_files failed before execution.'
  const failure = createRepositionFilesFailure(error)
  const existingItem = context.state.findTimelineItem(toolCallId)
  const updates = {
    paths: [],
    status: 'failed' as const,
    error: failure.userMessage,
    rawError: failure.rawError,
  }

  if (existingItem?.type === 'reposition_files') {
    context.state.updateTimelineItem(toolCallId, updates, 'reposition_files_failed')
    return
  }

  context.state.addTimelineItem(
    {
      type: 'reposition_files',
      ...updates,
      timestamp: Date.now(),
      agent: context.agent,
    },
    'reposition_files_failed',
    toolCallId
  )
}

function handleProgressDelta(tracking: StreamingToolCall, chunkId: string, context: ToolContext): void {
  const text = extractJsonStringField(tracking.argsText, 'message')
  if (!text) {
    return
  }

  context.eventStream.emitEvent({
    type: 'progress_streaming',
    itemId: chunkId,
    timestamp: Date.now(),
    streamingText: text,
  })
}

function handleTextEditorDelta(tracking: StreamingToolCall, chunkId: string, context: ToolContext): void {
  const isWriteFile = tracking.toolName === 'write_file'
  const writePreview = isWriteFile ? getWriteFilePreview(tracking.argsText) : null
  const path = isWriteFile ? writePreview?.path : extractJsonStringField(tracking.argsText, 'path')
  const command = extractJsonStringField(tracking.argsText, 'command')
  const mode = extractJsonStringField(tracking.argsText, 'mode')
  const fileText = extractJsonStringField(tracking.argsText, 'file_text')
  const newStr =
    extractJsonStringField(tracking.argsText, 'new_str') || extractJsonStringField(tracking.argsText, 'new_text')
  const content = fileText || newStr || ''
  const filePath = path ? resolveWorkspaceFilePath(path) || undefined : undefined
  const lineCount = isWriteFile ? writePreview?.lineCount || 0 : countContentLines(content)
  const animationKey = isWriteFile && filePath?.toLowerCase().endsWith('.md') ? filePath : undefined

  const displayCommand =
    tracking.toolName === 'read_file'
      ? 'view'
      : (isWriteFile ? 'create' : undefined) ||
        (tracking.toolName === 'delete_file'
          ? 'delete'
          : tracking.toolName === 'edit_file'
            ? mode === 'insert_after'
              ? 'insert'
              : mode === 'replace_exact' || mode === 'replace_entire'
                ? 'str_replace'
                : undefined
            : undefined) ||
        command ||
        undefined

  const patchSet: NonNullable<ToolStreamingPatch['set']> = {
    toolName: tracking.toolName,
    filePath,
    command: displayCommand || undefined,
    lineCount: lineCount > 0 ? lineCount : undefined,
  }

  if (animationKey) {
    patchSet.animationKey = animationKey

    const markdownBody = writePreview?.content ?? ''
    const previousMarkdownBody = tracking.lastWriteMarkdownBody ?? ''

    if (markdownBody.startsWith(previousMarkdownBody)) {
      const markdownAppend = markdownBody.slice(previousMarkdownBody.length)
      if (markdownAppend) {
        patchSet.markdownAppend = markdownAppend
      }
    } else {
      patchSet.markdownBody = markdownBody
    }

    tracking.lastWriteMarkdownBody = markdownBody
  } else if (isWriteFile) {
    tracking.lastWriteMarkdownBody = undefined
  }

  emitToolStreamingPatch(context, chunkId, {
    set: patchSet,
  })
}

function countContentLines(content: string): number {
  if (!content) {
    return 0
  }

  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content
  return normalized ? normalized.split('\n').length : 1
}

function handleSearchDelta(tracking: StreamingToolCall, chunkId: string, context: ToolContext): void {
  const objective = extractJsonStringField(tracking.argsText, 'objective')
  if (objective === null) {
    return
  }

  emitToolStreamingPatch(context, chunkId, {
    set: {
      toolName: tracking.toolName,
      objective,
    },
  })
}

function handleFetchDelta(tracking: StreamingToolCall, chunkId: string, context: ToolContext): void {
  const urls = extractJsonStringArrayField(tracking.argsText, 'urls')
  const objective = extractJsonStringField(tracking.argsText, 'objective')

  if (!urls?.length && objective === null) {
    return
  }

  emitToolStreamingPatch(context, chunkId, {
    set: {
      toolName: tracking.toolName,
      urls: urls || undefined,
      objective: objective ?? undefined,
    },
  })
}

function handleAskQuestionDelta(tracking: StreamingToolCall, chunkId: string, context: ToolContext, now: number): void {
  const contextMarkdown = extractJsonStringField(tracking.argsText, 'context')

  if (typeof contextMarkdown === 'string' && contextMarkdown.length > 0) {
    const contextChanged = contextMarkdown !== tracking.lastAskQuestionContextText
    const canEmitByThrottle = now - tracking.lastEmitTime >= STREAM_THROTTLE_MS
    const shouldEmitContext = contextChanged && (!tracking.askQuestionContextStarted || canEmitByThrottle)

    if (shouldEmitContext) {
      tracking.askQuestionContextStarted = true
      tracking.lastAskQuestionContextText = contextMarkdown
      tracking.lastEmitTime = now

      emitToolStreamingPatch(context, chunkId, {
        set: {
          toolName: 'ask_question',
          text: contextMarkdown,
        },
      })
    }
  }

  if (!tracking.askQuestionQuestionGenerationEmitted && hasJsonFieldStarted(tracking.argsText, 'questions')) {
    tracking.askQuestionQuestionGenerationEmitted = true

    emitToolStreamingPatch(context, chunkId, {
      set: {
        toolName: 'ask_question',
        phase: 'question_generation',
      },
    })
  }
}
