import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import ComposioService, {
  SlackInvalidPermalinkError,
  SlackMessageNotFoundError,
  SlackNotConnectedError,
} from '#services/composio_service'
import { fetchSlackMessageValidator } from '#validators/slack_message'

@inject()
export default class SlackMessageController {
  constructor(private composioService: ComposioService) {}

  async fetch({ params, auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const { permalink } = await request.validateUsing(fetchSlackMessageValidator)

    try {
      const message = await this.composioService.fetchSlackMessage(user.id, workspaceId, permalink)
      return response.ok(message)
    } catch (error) {
      // Typed errors map to user-facing 4xx responses. Anything else bubbles up
      // to the global exception handler, which captures to Sentry once.
      if (error instanceof SlackNotConnectedError) {
        return response.badRequest({ code: 'SLACK_NOT_CONNECTED', error: error.message })
      }
      if (error instanceof SlackInvalidPermalinkError) {
        return response.badRequest({ code: 'INVALID_PERMALINK', error: error.message })
      }
      if (error instanceof SlackMessageNotFoundError) {
        return response.notFound({ code: 'MESSAGE_NOT_FOUND', error: error.message })
      }
      throw error
    }
  }
}
