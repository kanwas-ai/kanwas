import { inject } from '@adonisjs/core'
import WorkspaceViewed from '#events/workspace_viewed'
import PostHogService from '#services/posthog_service'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'

@inject()
export default class TrackWorkspaceViewed {
  private logger = ContextualLogger.createFallback({ component: 'TrackWorkspaceViewed' })

  constructor(private posthogService: PostHogService) {}

  handle(event: WorkspaceViewed) {
    const { user, workspace, organization, organizationRole, context } = event

    try {
      this.posthogService.trackWorkspaceViewed({
        correlationId: context.correlationId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
        },
        organizationRole,
      })
    } catch (error) {
      this.logger.error(
        {
          err: toError(error),
          correlationId: context.correlationId,
          userId: context.userId,
          workspaceId: context.workspaceId ?? workspace.id,
        },
        'Failed to track workspace view in PostHog'
      )
    }
  }
}
