import { inject } from '@adonisjs/core'
import InvocationCompleted from '#events/invocation_completed'
import OrganizationUsageService from '#services/organization_usage_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'

@inject()
export default class TrackInvocationUsage {
  constructor(private readonly organizationUsageService: OrganizationUsageService) {}

  async handle(event: InvocationCompleted) {
    const logger = ContextualLogger.createFallback({
      component: 'TrackInvocationUsage',
      correlationId: event.context.correlationId,
      userId: event.payload.userId,
      workspaceId: event.payload.workspaceId,
    })

    try {
      await this.organizationUsageService.syncCurrentUsagePeriodsForOrganization({
        organizationId: event.payload.organizationId,
        invocationId: event.payload.invocationId,
      })
    } catch (error) {
      logger.error(
        {
          operation: 'track_invocation_usage_listener_failed',
          invocationId: event.payload.invocationId,
          organizationId: event.payload.organizationId,
          blocked: event.payload.blocked,
          err: toError(error),
        },
        'Invocation usage tracking failed'
      )
    }
  }
}
