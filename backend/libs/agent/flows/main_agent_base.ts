import { hasToolCall, stepCountIs } from 'ai'
import {
  createNativeTools,
  createSkillInvokeTool,
  createSkillTool,
  getSkillToolDescription,
  progressTool,
  SUGGEST_NEXT_TASKS_TOOL_NAME,
  suggestNextTasksTool,
  startTaskTool,
  utilityTools,
} from '../tools/index.js'
import { buildExploreSubagentTools, buildExternalSubagentTools } from '../subagent/tools.js'
import type { ProviderConfig } from '../providers/types.js'
import type { ProductAgentFlowDefinition } from './shared.js'

interface CreateMainAgentFlowDefinitionOptions {
  name: 'product-agent' | 'onboarding'
  model: string
  provider: ProviderConfig
  mainPromptNames: string[]
  includeSuggestNextTasksTool: boolean
}

const EXPLORE_SUBAGENT_MAX_OUTPUT_TOKENS = 800

export function createMainAgentFlowDefinition(
  options: CreateMainAgentFlowDefinitionOptions
): ProductAgentFlowDefinition {
  const exploreModelTier = options.provider.subagentModelTiers.explore
  const externalModelTier = options.provider.subagentModelTiers.external

  return {
    name: options.name,
    mainPromptNames: options.mainPromptNames,
    model: options.model,
    maxIterations: 50,
    terminalToolName: undefined,
    enableComposio: false,
    providerOptions: options.provider.generationOptions({ modelId: options.model, flowHint: 'execute' }),
    buildTools: (context) => {
      const nativeTools = createNativeTools(context)
      const skillInvokeTool = createSkillInvokeTool(getSkillToolDescription())

      return {
        ...(options.provider.name === 'openai' ? {} : { progress: progressTool }),
        start_task: startTaskTool,
        ...nativeTools,
        ...utilityTools,
        ...(options.includeSuggestNextTasksTool ? { [SUGGEST_NEXT_TASKS_TOOL_NAME]: suggestNextTasksTool } : {}),
        skill: skillInvokeTool,
        create_skill: createSkillTool,
      }
    },
    stopWhenFactory: ({ maxIterations }) => [stepCountIs(maxIterations), hasToolCall('ask_question')],
    subagents: [
      {
        name: 'explore',
        description: 'Workspace exploration - finds files, patterns, and gathers context',
        promptFile: 'explorer',
        model: exploreModelTier,
        modelId: options.provider.modelTiers[exploreModelTier],
        maxOutputTokens: EXPLORE_SUBAGENT_MAX_OUTPUT_TOKENS,
        maxIterations: 50,
        terminalToolName: 'return_output',
        enableComposio: false,
        providerOptions: options.provider.generationOptions({
          modelId: options.provider.modelTiers[exploreModelTier],
          flowHint: 'explore',
        }),
        buildTools: (context) => buildExploreSubagentTools(context),
        buildUserPrompt: ({ workspaceTree }) =>
          workspaceTree
            ? `<workspace_structure>\n${workspaceTree}\n</workspace_structure>\n\nBegin your exploration task.`
            : 'Begin your exploration task.',
        stopWhenFactory: ({ maxIterations, terminalToolName }) => [
          stepCountIs(maxIterations),
          hasToolCall(terminalToolName),
        ],
      },
      {
        name: 'external',
        description: 'External integrations - executes actions via connected services',
        promptFile: 'external',
        model: externalModelTier,
        modelId: options.provider.modelTiers[externalModelTier],
        maxIterations: 30,
        terminalToolName: 'return_output',
        enableComposio: true,
        providerOptions: options.provider.generationOptions({
          modelId: options.provider.modelTiers[externalModelTier],
          flowHint: 'external',
        }),
        buildTools: (context, subagentOptions) =>
          buildExternalSubagentTools(context, subagentOptions?.composioTools || {}),
        buildUserPrompt: () => 'Begin your task.',
        stopWhenFactory: ({ maxIterations, terminalToolName }) => [
          stepCountIs(maxIterations),
          hasToolCall(terminalToolName),
        ],
      },
    ],
  }
}
