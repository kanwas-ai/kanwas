import { inject } from '@adonisjs/core'
import InvocationCompleted from '#events/invocation_completed'
import Invocation from '#models/invocation'
import Task from '#models/task'
import { ContextualLogger } from '#services/contextual_logger'
import WorkspaceSuggestedTaskService from '#services/workspace_suggested_task_service'
import WorkspaceSuggestedTaskGenerationTriggerService from '#services/workspace_suggested_task_generation_trigger_service'

const TASK_COUNT_THRESHOLD = 2

@inject()
export default class GenerateSuggestedTasksAfterOnboarding {
  constructor(
    private workspaceSuggestedTaskService: WorkspaceSuggestedTaskService,
    private workspaceSuggestedTaskGenerationTriggerService: WorkspaceSuggestedTaskGenerationTriggerService
  ) {}

  async handle(event: InvocationCompleted) {
    const { payload, context } = event
    const logger = ContextualLogger.createFallback({
      component: 'GenerateSuggestedTasksAfterOnboarding',
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      correlationId: context.correlationId,
    })

    if (payload.blocked) {
      return
    }

    const invocation = await Invocation.find(payload.invocationId)
    if (!invocation || invocation.parentInvocationId) {
      return
    }

    // Don't trigger during onboarding itself — wait until user starts real work
    if (invocation.source === 'onboarding') {
      return
    }

    const existingSuggestedTaskSet = await this.workspaceSuggestedTaskService.getState(payload.workspaceId)

    if (existingSuggestedTaskSet.generatedAt || existingSuggestedTaskSet.isLoading) {
      return
    }

    const taskCount = await Task.query().where('workspace_id', payload.workspaceId).count('* as total').first()

    const total = Number(taskCount?.$extras.total ?? 0)

    if (total < TASK_COUNT_THRESHOLD) {
      return
    }

    const onboardingInvocation = await Invocation.query()
      .where('workspace_id', payload.workspaceId)
      .where('source', 'onboarding')
      .whereNull('parent_invocation_id')
      .first()

    if (!onboardingInvocation) {
      return
    }

    logger.info(
      { taskCount: total },
      'Onboarding completed and task threshold reached, triggering suggested task generation'
    )

    await this.workspaceSuggestedTaskGenerationTriggerService.triggerForWorkspace({
      workspaceId: payload.workspaceId,
      triggeringUserId: payload.userId,
      correlationId: context.correlationId,
    })
  }
}
