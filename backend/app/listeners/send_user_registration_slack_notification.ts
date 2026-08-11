import UserRegistered from '#events/user_registered'
import { ContextualLogger } from '#services/contextual_logger'
import SlackWebhookService from '#services/slack_webhook_service'
import { toError } from '#services/error_utils'

export default class SendUserRegistrationSlackNotification {
  async handle(event: UserRegistered) {
    const logger = ContextualLogger.createFallback({
      component: 'SendUserRegistrationSlackNotification',
      correlationId: event.context.correlationId,
      userId: event.userId,
      workspaceId: event.context.workspaceId,
      organizationId: event.context.organizationId,
    })

    try {
      const slackWebhookService = new SlackWebhookService()

      await slackWebhookService.sendRegistrationNotification({
        name: event.name,
        email: event.email,
        source: event.source,
        viaInvite: event.viaInvite,
      })
    } catch (error) {
      logger.error(
        {
          err: toError(error),
          source: event.source,
          viaInvite: event.viaInvite,
        },
        'Failed to send registration Slack notification'
      )
    }
  }
}
