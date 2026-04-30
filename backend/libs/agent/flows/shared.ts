import type { ToolSet } from 'ai'
import type { ModelTier, SubagentType } from '../types.js'
import type { AgentProviderCallOptions, AgentProviderPromptOptions, ProviderConfig } from '../providers/types.js'
import type { ToolContext } from '../tools/context.js'

export const WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME = 'return_suggested_tasks'

export interface FlowSystemPromptBlock {
  role: 'system'
  content: string
  providerOptions?: AgentProviderPromptOptions
}

export type MainToolBuilder = (context: ToolContext) => ToolSet
export type SubagentToolBuilder = (context: ToolContext, options?: { composioTools?: ToolSet }) => ToolSet

export interface ProductAgentSubagentDefinition {
  name: SubagentType
  description: string
  promptFile: string
  model: ModelTier
  modelId: string
  maxOutputTokens?: number
  maxIterations: number
  terminalToolName: string
  enableComposio: boolean
  providerOptions: AgentProviderCallOptions
  buildTools: SubagentToolBuilder
  buildUserPrompt: (input: { workspaceTree?: string }) => string
  stopWhenFactory: (input: { maxIterations: number; terminalToolName: string }) => unknown[]
}

export type AgentFlowName = 'product-agent' | 'onboarding' | 'workspace-suggested-tasks'

export interface ProductAgentFlowDefinition {
  name: AgentFlowName
  mainPromptNames: string[]
  model: string
  maxIterations: number
  terminalToolName?: string
  enableComposio: boolean
  providerOptions: AgentProviderCallOptions
  buildTools: MainToolBuilder
  stopWhenFactory: (input: { maxIterations: number }) => unknown[]
  subagents: ProductAgentSubagentDefinition[]
}

export interface ResolvedMainAgentFlow {
  model: string
  maxIterations: number
  terminalToolName?: string
  enableComposio: boolean
  providerOptions: AgentProviderCallOptions
  stopWhen: unknown[]
  systemPrompts: FlowSystemPromptBlock[]
  buildTools: MainToolBuilder
}

export interface ResolvedSubagentFlow {
  name: SubagentType
  description: string
  model: ModelTier
  modelId: string
  maxOutputTokens?: number
  maxIterations: number
  terminalToolName: string
  enableComposio: boolean
  providerOptions: AgentProviderCallOptions
  stopWhen: unknown[]
  systemPrompts: FlowSystemPromptBlock[]
  buildTools: SubagentToolBuilder
  buildUserPrompt: (input: { workspaceTree?: string }) => string
}

export interface ResolvedProductAgentFlow {
  name: AgentFlowName
  main: ResolvedMainAgentFlow
  subagents: ResolvedSubagentFlow[]
}

export function resolveProductAgentFlow(input: {
  definition: ProductAgentFlowDefinition
  mainSystemPrompts: string[]
  subagentPromptByName: Record<string, string | string[]>
  provider?: ProviderConfig
}): ResolvedProductAgentFlow {
  const promptOpts = input.provider?.name === 'openai' ? {} : (input.provider?.promptOptions() ?? {})

  const sharedSystemPrompts = normalizePromptBlocks(input.mainSystemPrompts)

  applyCacheBreakpointToLast(sharedSystemPrompts, promptOpts)

  return {
    name: input.definition.name,
    main: {
      model: input.definition.model,
      maxIterations: input.definition.maxIterations,
      terminalToolName: input.definition.terminalToolName,
      enableComposio: input.definition.enableComposio,
      providerOptions: input.definition.providerOptions,
      stopWhen: input.definition.stopWhenFactory({ maxIterations: input.definition.maxIterations }),
      systemPrompts: sharedSystemPrompts,
      buildTools: input.definition.buildTools,
    },
    subagents: input.definition.subagents.map((subagent) => {
      const subagentSystemPrompts = normalizePromptBlocks(input.subagentPromptByName[subagent.name])

      applyCacheBreakpointToLast(subagentSystemPrompts, promptOpts)

      return {
        name: subagent.name,
        description: subagent.description,
        model: subagent.model,
        modelId: subagent.modelId,
        maxOutputTokens: subagent.maxOutputTokens,
        maxIterations: subagent.maxIterations,
        terminalToolName: subagent.terminalToolName,
        enableComposio: subagent.enableComposio,
        providerOptions: subagent.providerOptions,
        stopWhen: subagent.stopWhenFactory({
          maxIterations: subagent.maxIterations,
          terminalToolName: subagent.terminalToolName,
        }),
        systemPrompts: subagentSystemPrompts,
        buildTools: subagent.buildTools,
        buildUserPrompt: subagent.buildUserPrompt,
      }
    }),
  }
}

export function getSubagentFlow(flow: ResolvedProductAgentFlow, name: string): ResolvedSubagentFlow | undefined {
  return flow.subagents.find((subagent) => subagent.name === name)
}

export function getSubagentNames(flow: ResolvedProductAgentFlow): string[] {
  return flow.subagents.map((subagent) => subagent.name)
}

function createPromptBlock(content: string, providerOptions: AgentProviderPromptOptions = {}): FlowSystemPromptBlock {
  return {
    role: 'system',
    content,
    providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
  }
}

function normalizePromptBlocks(
  prompt: string | string[] | undefined,
  providerOptions: AgentProviderPromptOptions = {}
): FlowSystemPromptBlock[] {
  if (Array.isArray(prompt)) {
    if (prompt.length === 0) {
      return [createPromptBlock('', providerOptions)]
    }

    return prompt.map((content) => createPromptBlock(content, providerOptions))
  }

  return [createPromptBlock(prompt || '', providerOptions)]
}

function applyCacheBreakpointToLast(blocks: FlowSystemPromptBlock[], promptOpts: AgentProviderPromptOptions): void {
  if (blocks.length === 0 || Object.keys(promptOpts).length === 0) return
  const last = blocks[blocks.length - 1]
  blocks[blocks.length - 1] = {
    ...last,
    providerOptions: mergeProviderOptions(last.providerOptions, promptOpts),
  }
}

function mergeProviderOptions(
  existing: AgentProviderPromptOptions | undefined,
  incoming: AgentProviderPromptOptions
): AgentProviderPromptOptions {
  const merged: AgentProviderPromptOptions = { ...(existing || {}) }

  for (const [key, value] of Object.entries(incoming)) {
    const current = merged[key]

    if (isRecord(current) && isRecord(value)) {
      merged[key] = { ...current, ...value }
      continue
    }

    merged[key] = value
  }

  return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
