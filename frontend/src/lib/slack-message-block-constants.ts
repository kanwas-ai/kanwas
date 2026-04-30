export const SLACK_MESSAGE_TYPE = 'slackMessage' as const

export const SLACK_MESSAGE_PROP_SCHEMA = {
  userName: { default: '' },
  userAvatar: { default: '' },
  text: { default: '' },
  timestamp: { default: '' },
  permalink: { default: '' },
  channel: { default: '' },
  mentions: { default: '' },
} as const
