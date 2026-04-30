import Waitlist from '#models/waitlist'
import SlackWebhookService from '#services/slack_webhook_service'
import { waitlistValidator } from '#validators/waitlist'
import type { HttpContext } from '@adonisjs/core/http'

export default class WaitlistController {
  async store({ request, response }: HttpContext) {
    const data = await request.validateUsing(waitlistValidator)

    const existing = await Waitlist.findBy('email', data.email)
    if (existing) {
      return response.ok({
        message: 'You are already on the waitlist!',
        alreadyExists: true,
      })
    }

    await Waitlist.create(data)

    // Send Slack notification (fire-and-forget)
    const slack = new SlackWebhookService()
    slack.sendWaitlistNotification(data).catch(() => {})

    return response.created({
      message: 'Successfully joined the waitlist!',
      alreadyExists: false,
    })
  }
}
