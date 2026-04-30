import { inject } from '@adonisjs/core'
import InvocationCompleted from '#events/invocation_completed'
import Invocation from '#models/invocation'
import TaskLifecycleService from '#services/task_lifecycle_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'
import { extractModifiedFolders } from '#services/task_folder_service'

@inject()
export default class SyncTaskModifiedFolders {
  constructor(private readonly taskLifecycleService: TaskLifecycleService) {}

  async handle(event: InvocationCompleted) {
    const logger = ContextualLogger.createFallback({
      component: 'SyncTaskModifiedFolders',
      correlationId: event.context.correlationId,
      userId: event.payload.userId,
      workspaceId: event.payload.workspaceId,
    })

    if (event.payload.blocked) {
      return
    }

    try {
      const invocation = await Invocation.query()
        .where('id', event.payload.invocationId)
        .select('id', 'workspace_id', 'user_id', 'agent_state')
        .first()

      if (!invocation?.agentState) {
        return
      }

      const modifiedFolders = extractModifiedFolders(invocation.agentState.state?.timeline ?? [])
      if (modifiedFolders.length === 0) {
        return
      }

      const rootInvocationId = await this.taskLifecycleService.resolveRootInvocationIdForScope(
        invocation.id,
        invocation.workspaceId,
        invocation.userId
      )

      await this.taskLifecycleService.mergeModifiedFolders(rootInvocationId, modifiedFolders)
    } catch (error) {
      logger.error(
        {
          operation: 'sync_task_modified_folders_listener_failed',
          invocationId: event.payload.invocationId,
          err: toError(error),
        },
        'Task modified folder sync failed'
      )
    }
  }
}
