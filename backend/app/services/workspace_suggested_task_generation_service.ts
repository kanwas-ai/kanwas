import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import { inject } from '@adonisjs/core'
import { CanvasAgent } from '#agent/index'
import type { ProviderConfig } from '#agent/providers/types'
import { resolveProviderFromUserConfig } from '#agent/providers/user_config'
import {
  createWorkspaceSuggestedTaskFlowDefinition,
  type ResolvedProductAgentFlow,
  WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME,
} from '#agent/flow'
import { promptManager } from '#agent/prompt_manager'
import User from '#models/user'
import Workspace from '#models/workspace'
import BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'
import UserConfigService from '#services/user_config_service'
import {
  normalizeSuggestedTaskResponseTasks,
  suggestedTaskResponseSchema,
  type SuggestedTaskResponse,
} from '#agent/workspace_suggested_tasks/normalization'
import type { WorkspaceSuggestedTask } from '#types/workspace_suggested_task'

export class WorkspaceSuggestedTaskGenerationError extends Error {
  declare cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'WorkspaceSuggestedTaskGenerationError'
    this.cause = options?.cause
  }
}

@inject()
export default class WorkspaceSuggestedTaskGenerationService {
  constructor(
    private backgroundAgentExecutionService: BackgroundAgentExecutionService,
    private userConfigService: UserConfigService
  ) {}

  async generateForWorkspace(input: {
    workspaceId: string
    triggeringUserId: string
    correlationId: string
  }): Promise<WorkspaceSuggestedTask[]> {
    const logger = ContextualLogger.createFallback({
      component: 'WorkspaceSuggestedTaskGenerationService',
      workspaceId: input.workspaceId,
      userId: input.triggeringUserId,
      correlationId: input.correlationId,
    })

    const [workspace, user] = await Promise.all([
      Workspace.findOrFail(input.workspaceId),
      User.findOrFail(input.triggeringUserId),
    ])

    const invocationId = `suggested-tasks-${randomUUID()}`
    let preparedExecution: Awaited<ReturnType<BackgroundAgentExecutionService['prepareExecution']>> | null = null

    try {
      const agent = await app.container.make(CanvasAgent)
      const userConfig = await this.userConfigService.getConfig(input.triggeringUserId)
      const provider = resolveProviderFromUserConfig(userConfig, {
        logger,
      })
      agent.overrideProvider(provider)
      const flow = this.buildFlow(provider)
      preparedExecution = await this.backgroundAgentExecutionService.prepareExecution({
        workspace,
        user,
        invocationId,
        aiSessionId: invocationId,
        correlationId: input.correlationId,
        tokenExpiresIn: '30 minutes',
      })

      const result = await agent.execute(this.buildPrompt(workspace.name), preparedExecution.context, flow, undefined, {
        allowTerminalToolCompletion: true,
      })

      if (!result) {
        throw new Error('Suggested task generation did not complete')
      }

      const structuredResponse = this.extractStructuredResponse(result.toolResults)
      return normalizeSuggestedTaskResponseTasks(structuredResponse.tasks)
    } catch (error) {
      throw new WorkspaceSuggestedTaskGenerationError(
        `Failed to generate suggested tasks for workspace ${input.workspaceId}`,
        { cause: toError(error) }
      )
    } finally {
      if (preparedExecution) {
        try {
          await preparedExecution.cleanup()
        } catch (error) {
          logger.warn(
            {
              err: toError(error),
            },
            'Failed to cleanup suggested task invocation sandbox'
          )
        }
      }
    }
  }

  private buildFlow(provider: ProviderConfig): ResolvedProductAgentFlow {
    return CanvasAgent.resolveInvocationFlow({
      definition: createWorkspaceSuggestedTaskFlowDefinition({
        model: provider.modelTiers.big,
        responseSchema: suggestedTaskResponseSchema,
        provider,
      }),
      mainSystemPrompts: [promptManager.getPrompt('workspace_suggested_tasks', {}, provider.name)],
      subagentPromptByName: {},
      provider,
    })
  }

  private buildPrompt(workspaceName: string): string {
    return [
      `Workspace name: ${workspaceName}`,
      '',
      'Inspect the workspace filesystem and return 1-4 shared suggested tasks for this workspace.',
    ].join('\n')
  }

  private extractStructuredResponse(
    toolResults: Array<{ toolName: string; input: unknown; output: unknown }>
  ): SuggestedTaskResponse {
    const structuredToolResult = [...toolResults]
      .reverse()
      .find((result) => result.toolName === WORKSPACE_SUGGESTED_TASK_TERMINAL_TOOL_NAME)

    if (!structuredToolResult) {
      throw new Error('Suggested task generator did not return a structured response')
    }

    return suggestedTaskResponseSchema.parse(structuredToolResult.output ?? structuredToolResult.input)
  }
}
