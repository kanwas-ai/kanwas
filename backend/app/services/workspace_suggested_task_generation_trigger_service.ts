import { inject } from '@adonisjs/core'
import { ContextualLogger } from '#services/contextual_logger'
import { getErrorMessage, toError } from '#services/error_utils'
import { withSentryContext } from '#services/sentry_context'
import WorkspaceSuggestedTaskGenerationService from '#services/workspace_suggested_task_generation_service'
import WorkspaceSuggestedTaskService from '#services/workspace_suggested_task_service'

export interface TriggerSuggestedTaskGenerationInput {
  workspaceId: string
  triggeringUserId: string
  correlationId: string
}

export class WorkspaceSuggestedTaskGenerationTriggerError extends Error {
  declare cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'WorkspaceSuggestedTaskGenerationTriggerError'
    this.cause = options?.cause
  }
}

@inject()
export default class WorkspaceSuggestedTaskGenerationTriggerService {
  constructor(
    private workspaceSuggestedTaskService: WorkspaceSuggestedTaskService,
    private workspaceSuggestedTaskGenerationService: WorkspaceSuggestedTaskGenerationService
  ) {}

  async triggerForWorkspace(input: TriggerSuggestedTaskGenerationInput): Promise<void> {
    return withSentryContext(
      {
        component: 'WorkspaceSuggestedTaskGenerationTriggerService',
        operation: 'generate_suggested_tasks',
        workspaceId: input.workspaceId,
        userId: input.triggeringUserId,
        correlationId: input.correlationId,
      },
      async () => {
        const logger = ContextualLogger.createFallback({
          component: 'WorkspaceSuggestedTaskGenerationTriggerService',
          workspaceId: input.workspaceId,
          userId: input.triggeringUserId,
          correlationId: input.correlationId,
        })

        const beginResult = await this.workspaceSuggestedTaskService.beginGeneration(input.workspaceId)

        if (beginResult.status !== 'started') {
          logger.info({ beginStatus: beginResult.status }, 'Skipped suggested task generation trigger')
          return
        }

        logger.info('Starting suggested task generation')

        try {
          const tasks = await this.workspaceSuggestedTaskGenerationService.generateForWorkspace(input)
          const completionResult = await this.workspaceSuggestedTaskService.completeGeneration(input.workspaceId, tasks)

          if (completionResult.status !== 'completed') {
            logger.warn({ completionStatus: completionResult.status }, 'Suggested task completion was rejected')
          }
        } catch (error) {
          const generationError = toError(error)
          const errorMessage = getErrorMessage(generationError)

          let failureResult: Awaited<ReturnType<WorkspaceSuggestedTaskService['failGeneration']>>

          try {
            failureResult = await this.workspaceSuggestedTaskService.failGeneration(input.workspaceId, errorMessage)
          } catch (failureStateError) {
            throw new WorkspaceSuggestedTaskGenerationTriggerError(
              'Suggested task generation failed and its failure state could not be persisted',
              {
                cause: new AggregateError(
                  [generationError, toError(failureStateError)],
                  'Suggested task generation failed'
                ),
              }
            )
          }

          if (failureResult.status !== 'failed') {
            logger.warn({ failureStatus: failureResult.status }, 'Suggested task failure state was rejected')
          }

          throw new WorkspaceSuggestedTaskGenerationTriggerError('Suggested task generation failed', {
            cause: generationError,
          })
        }
      }
    )
  }
}
