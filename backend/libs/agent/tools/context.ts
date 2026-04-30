import type { State } from '../state.js'
import type { EventStream } from '../events.js'
import type { LLM } from '../llm.js'
import type { SandboxManager } from '../sandbox/index.js'
import type { AgentInfo } from '../types.js'
import type { ProviderName } from '../providers/types.js'
import type WorkspaceDocumentService from '#services/workspace_document_service'
import type WebSearchService from '#services/web_search_service'
import type PostHogService from '#services/posthog_service'
import type { TraceContext, TraceIdentity } from '../tracing/posthog.js'
import type { ResolvedProductAgentFlow } from '../flow.js'

/**
 * Context passed to all tools via experimental_context.
 *
 * Usage with generateText:
 * ```typescript
 * await generateText({
 *   model: anthropic('claude-sonnet-4-5'),
 *   tools: { myTool },
 *   experimental_context: context,
 * })
 * ```
 */
export interface ToolContext {
  // Core state management
  state: State

  // Event streaming to UI
  eventStream: EventStream

  // LLM for sub-completions
  llm: LLM

  // Sandbox for code execution
  sandboxManager: SandboxManager

  // Agent metadata
  agent: AgentInfo

  // Invocation-resolved runtime flow
  flow: ResolvedProductAgentFlow

  // Services (flat, matching existing ToolContext)
  workspaceDocumentService: WorkspaceDocumentService
  webSearchService: WebSearchService
  posthogService: PostHogService

  // Trace propagation for PostHog LLM analytics
  traceContext: TraceContext
  traceIdentity: TraceIdentity

  // LLM provider name (determines which native tool variants to use)
  providerName: ProviderName

  // Whether the provider supports native tool types (shell, bash_20250124, etc.)
  supportsNativeTools: boolean

  // User ID for database queries (e.g., skill preferences)
  userId: string

  // Abort signal for cancellation
  abortSignal?: AbortSignal
}

/**
 * Extract typed context from Vercel AI SDK's experimental_context.
 *
 * The Vercel AI SDK passes context to tool execute functions via a second parameter
 * that contains { experimental_context: T }. This helper extracts and types it.
 *
 * @example
 * ```typescript
 * import { tool } from 'ai'
 * import { z } from 'zod'
 * import { getToolContext } from './context.js'
 *
 * export const myTool = tool({
 *   description: 'Does something useful',
 *   parameters: z.object({ input: z.string() }),
 *   execute: async ({ input }, execContext) => {
 *     const ctx = getToolContext(execContext)
 *     ctx.state.addTimelineItem({ ... })
 *     return 'result'
 *   },
 * })
 * ```
 */
export function getToolContext(execContext: unknown): ToolContext {
  const ctx = (execContext as { experimental_context?: ToolContext })?.experimental_context
  if (!ctx) {
    throw new Error('Tool context not provided. Ensure experimental_context is passed to generateText().')
  }
  return ctx
}

/**
 * Type guard for checking if context exists.
 * Useful for optional context scenarios or during migration when some code paths
 * might not have context available yet.
 */
export function hasToolContext(execContext: unknown): boolean {
  return !!(execContext as { experimental_context?: unknown })?.experimental_context
}

/**
 * Extract the tool call ID from the Vercel AI SDK's execution context.
 *
 * The toolCallId is the same as chunk.id used during streaming, so passing it
 * to addTimelineItem() ensures streaming items and timeline items share the same ID.
 * This prevents duplicate items appearing during streaming.
 */
export function getToolCallId(execContext: unknown): string | undefined {
  return (execContext as { toolCallId?: string })?.toolCallId
}
