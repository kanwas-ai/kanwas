import env from '#start/env'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'

interface WaitlistData {
  name: string
  email: string
  companyUrl?: string | null
  role?: string | null
  numberOfPms?: string | null
}

interface RegistrationNotificationData {
  name: string
  email: string
  source: 'password' | 'google'
  viaInvite: boolean
}

interface SlackBlock {
  type: string
  text?: { type: string; text: string; emoji?: boolean }
  fields?: { type: string; text: string }[]
  elements?: { type: string; text: string }[]
}

export default class SlackWebhookService {
  private webhookUrl: string | undefined
  private readonly logger = ContextualLogger.createFallback({ component: 'SlackWebhookService' })

  constructor() {
    this.webhookUrl = env.get('SLACK_WEBHOOK_URL')
  }

  private async send(blocks: SlackBlock[], text?: string): Promise<void> {
    if (!this.webhookUrl) {
      return
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, blocks }),
      })

      if (!response.ok) {
        const responseBody = await response.text()
        this.logger.error(
          {
            status: response.status,
            responseBody,
          },
          'Slack webhook request failed'
        )
      }
    } catch (error) {
      this.logger.error({ err: toError(error) }, 'Slack webhook request errored')
    }
  }

  async sendWaitlistNotification(data: WaitlistData): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000)

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 New Waitlist Signup!',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Name:*\n${data.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${data.email}`,
          },
        ],
      },
    ]

    // Add company URL and role if provided
    const companyRoleFields: { type: string; text: string }[] = []
    if (data.companyUrl) {
      companyRoleFields.push({
        type: 'mrkdwn',
        text: `*Company:*\n<${data.companyUrl}|${data.companyUrl}>`,
      })
    }
    if (data.role) {
      companyRoleFields.push({
        type: 'mrkdwn',
        text: `*Role:*\n${data.role}`,
      })
    }
    if (companyRoleFields.length > 0) {
      blocks.push({
        type: 'section',
        fields: companyRoleFields,
      })
    }

    // Add team size if provided
    if (data.numberOfPms) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Team Size:*\n${data.numberOfPms} PMs`,
          },
        ],
      })
    }

    // Add divider and timestamp
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Submitted at <!date^${timestamp}^{date_long} at {time}|${new Date().toISOString()}>`,
        },
      ],
    })

    await this.send(blocks, `New waitlist signup: ${data.email}`)
  }

  async sendRegistrationNotification(data: RegistrationNotificationData): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000)
    const sourceLabel = data.source === 'google' ? 'Google OAuth' : 'Email + Password'

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'New User Registration',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Name:*\n${data.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Email:*\n${data.email}`,
          },
          {
            type: 'mrkdwn',
            text: `*Signup Source:*\n${sourceLabel}`,
          },
          {
            type: 'mrkdwn',
            text: `*Used Invite:*\n${data.viaInvite ? 'Yes' : 'No'}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Registered at <!date^${timestamp}^{date_long} at {time}|${new Date().toISOString()}>`,
          },
        ],
      },
    ]

    await this.send(blocks, `New user registration: ${data.email}`)
  }
}
