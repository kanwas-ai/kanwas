import { createReactBlockSpec } from '@blocknote/react'
import { renderSlackMrkdwn } from './slack-mrkdwn'
import { SLACK_MESSAGE_TYPE, SLACK_MESSAGE_PROP_SCHEMA } from './slack-message-block-constants'

export const slackMessageBlockSpec = createReactBlockSpec(
  {
    type: SLACK_MESSAGE_TYPE,
    content: 'none',
    propSchema: SLACK_MESSAGE_PROP_SCHEMA,
  },
  {
    render: ({ block }) => {
      const { userName, userAvatar, text, timestamp, permalink, mentions } = block.props
      // `mentions` is stored as JSON-stringified because BlockNote propSchema only accepts primitives.
      let mentionsMap: Record<string, string> = {}
      try {
        mentionsMap = mentions ? JSON.parse(mentions) : {}
      } catch {
        // ignore parse error
      }

      const formattedTime = timestamp
        ? new Date(timestamp)
            .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            .replace(/\s(AM|PM)/i, (_, ap) => ` ${ap.toUpperCase()}`)
        : ''

      return (
        <div className="slack-message-embed" data-slack-message="true">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="slack-message-avatar" />
          ) : (
            <div className="slack-message-avatar slack-message-avatar-placeholder">
              {userName ? userName[0].toUpperCase() : '?'}
            </div>
          )}
          <div className="slack-message-body">
            <div className="slack-message-header">
              <span className="slack-message-author">{userName || 'Unknown'}</span>
              {formattedTime && <span className="slack-message-time">{formattedTime}</span>}
            </div>
            <div className="slack-message-text">{renderSlackMrkdwn(text, mentionsMap)}</div>
          </div>
          {permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              contentEditable={false}
              className="slack-message-embed-open"
              title="Open in Slack"
            >
              Open in Slack
            </a>
          )}
        </div>
      )
    },
    toExternalHTML: ({ block }) => {
      const { userName, text, permalink } = block.props
      if (permalink) {
        return (
          <a href={permalink}>
            {userName}: {text}
          </a>
        )
      }
      return (
        <p>
          <strong>{userName}</strong>: {text}
        </p>
      )
    },
  }
)
