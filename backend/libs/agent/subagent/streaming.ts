/**
 * Shared streaming utilities for subagents.
 * Handles report output streaming and extended thinking from ToolLoopAgent.
 */
import type { ToolContext } from '../tools/context.js'
import { extractJsonStringField } from '../utils/json_streaming.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Mutable state for tracking report output streaming across chunks.
 */
export interface ReportOutputState {
  itemId: string | null
  argsText: string
  activeToolCallId: string | null
}

/**
 * Mutable state for tracking extended thinking streaming across chunks.
 */
export interface ReasoningState {
  itemId: string | null
  accumulatedText: string
}

// ============================================================================
// Report Output Handlers (for return_output tool)
// ============================================================================

/**
 * Handle tool-input-start chunk for report output.
 * Creates a new ReportOutputItem when the terminal tool starts.
 */
export function handleToolInputStart(
  chunk: { type: 'tool-input-start'; toolName: string; id: string },
  state: ReportOutputState,
  context: ToolContext,
  terminalToolName: string,
  subagentId?: string
): void {
  if (chunk.toolName !== terminalToolName || !subagentId) return

  state.argsText = ''
  state.activeToolCallId = chunk.id
  state.itemId = context.state.addTimelineItem(
    {
      type: 'report_output',
      subagentId,
      content: '',
      status: 'streaming',
      timestamp: Date.now(),
    },
    'report_output_streaming'
  )
}

/**
 * Handle tool-input-delta chunk for report output.
 * Streams partial output content as it arrives.
 */
export function handleToolInputDelta(
  chunk: { type: 'tool-input-delta'; delta: string; id: string },
  state: ReportOutputState,
  context: ToolContext,
  subagentId?: string
): void {
  if (!state.itemId || chunk.id !== state.activeToolCallId) return

  state.argsText += chunk.delta
  const outputText = extractJsonStringField(state.argsText, 'output')
  if (outputText) {
    context.eventStream.emitEvent({
      type: 'report_output_streaming',
      itemId: state.itemId,
      timestamp: Date.now(),
      reportOutputText: outputText,
      lineCount: outputText.split('\n').length,
      subagentId: subagentId || undefined,
    })
  }
}

/**
 * Handle tool-call chunk for report output.
 * Marks the ReportOutputItem as completed with final content.
 */
export function handleToolCall(
  chunk: { type: 'tool-call'; toolName: string; toolCallId: string; input: unknown },
  state: ReportOutputState,
  context: ToolContext,
  terminalToolName: string
): void {
  if (chunk.toolName !== terminalToolName || !state.itemId || chunk.toolCallId !== state.activeToolCallId) return

  const input = chunk.input as { output?: string } | undefined
  const content = input?.output || ''
  context.state.updateTimelineItem(
    state.itemId,
    {
      content,
      status: 'completed',
      lineCount: content.split('\n').length,
    },
    'report_output_completed'
  )
  state.activeToolCallId = null
}

/**
 * Clean up report output state on error.
 */
export function cleanupReportOutput(state: ReportOutputState, context: ToolContext): void {
  if (state.itemId) {
    context.state.updateTimelineItem(state.itemId, { status: 'completed' }, 'report_output_completed')
  }
  state.activeToolCallId = null
}

// ============================================================================
// Extended Thinking Handlers
// ============================================================================

/**
 * Handle reasoning-delta chunk for extended thinking.
 * Creates a thinking timeline item on first chunk, streams updates thereafter.
 */
export function handleReasoningDelta(
  chunk: { type: 'reasoning-delta'; text: string },
  state: ReasoningState,
  context: ToolContext
): void {
  state.accumulatedText += chunk.text

  // Create thinking timeline item on first chunk
  if (!state.itemId) {
    state.itemId = context.state.addTimelineItem(
      {
        type: 'thinking',
        thought: chunk.text,
        streaming: true,
        timestamp: Date.now(),
        agent: context.agent,
      },
      'thinking'
    )
  }

  // Emit streaming event for UI
  context.eventStream.emitEvent({
    type: 'thinking_streaming',
    itemId: state.itemId,
    timestamp: Date.now(),
    streamingText: state.accumulatedText,
  })
}

/**
 * Handle reasoning-end chunk for extended thinking.
 * Finalizes the thinking timeline item and resets state for next reasoning block.
 */
export function handleReasoningEnd(state: ReasoningState, context: ToolContext): void {
  if (state.itemId && state.accumulatedText) {
    context.state.updateTimelineItem(state.itemId, { thought: state.accumulatedText, streaming: false }, 'thinking')
  }
  // Reset state for next reasoning block (critical for multi-iteration subagents)
  state.itemId = null
  state.accumulatedText = ''
}

/**
 * Clean up reasoning state on error.
 * Ensures timeline item doesn't stay in "streaming" state.
 */
export function cleanupReasoning(state: ReasoningState, context: ToolContext): void {
  if (state.itemId) {
    context.state.updateTimelineItem(state.itemId, { streaming: false }, 'thinking')
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the output from the terminal tool call.
 * Searches through all steps to find the terminal action.
 */
export function extractTerminalOutput<T extends { toolCalls: Array<{ toolName: string; input: unknown }> }>(
  steps: T[],
  terminalToolName: string
): string {
  for (const step of steps) {
    for (const call of step.toolCalls) {
      if (call.toolName === terminalToolName) {
        const input = call.input as { output?: string } | undefined
        return input?.output ?? ''
      }
    }
  }
  return ''
}
