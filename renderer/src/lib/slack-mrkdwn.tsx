import { Fragment, type ReactNode } from 'react'

/**
 * Minimal Slack mrkdwn parser.
 * Handles: *bold*, _italic_, ~strike~, `code`, <url>, <url|text>, <@U123>, <#C123|name>, <!channel>, <!here>, <!everyone>
 */
export function renderSlackMrkdwn(text: string, mentions: Record<string, string> = {}): ReactNode {
  if (!text) return null

  // Parse entities first: <!channel>, <@U>, <#C|name>, <url|text>, <url>
  const entityRegex = /<(!channel|!here|!everyone|@[UW][A-Z0-9]+|#[A-Z0-9]+(?:\|[^>]+)?|[^>]+)>/g
  const parts: Array<{ type: 'text' | 'entity'; value: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = entityRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'entity', value: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'entity') {
          return <Fragment key={i}>{renderEntity(part.value, mentions)}</Fragment>
        }
        return <Fragment key={i}>{renderFormatting(part.value)}</Fragment>
      })}
    </>
  )
}

function renderEntity(raw: string, mentions: Record<string, string>): ReactNode {
  if (raw === '!channel' || raw === '!here' || raw === '!everyone') {
    const label = raw.slice(1)
    return <span className="slack-mention-broadcast">@{label}</span>
  }

  if (raw.startsWith('@')) {
    const uid = raw.slice(1)
    const name = mentions[uid] || uid
    return <span className="slack-mention-user">@{name}</span>
  }

  if (raw.startsWith('#')) {
    const [, name] = raw.slice(1).split('|')
    return <span className="slack-channel-link">#{name || raw.slice(1)}</span>
  }

  if (raw.includes('|')) {
    const [url, label] = raw.split('|', 2)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="slack-link">
        {label}
      </a>
    )
  }

  return (
    <a href={raw} target="_blank" rel="noopener noreferrer" className="slack-link">
      {raw}
    </a>
  )
}

function renderFormatting(text: string): ReactNode {
  // Tokenize: *bold*, _italic_, ~strike~, `code`
  const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g
  const segments = text.split(tokenRegex)

  return (
    <>
      {segments.map((seg, i) => {
        if (!seg) return null
        if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
          return <strong key={i}>{seg.slice(1, -1)}</strong>
        }
        if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
          return <em key={i}>{seg.slice(1, -1)}</em>
        }
        if (seg.startsWith('~') && seg.endsWith('~') && seg.length > 2) {
          return <s key={i}>{seg.slice(1, -1)}</s>
        }
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
          return (
            <code key={i} className="slack-code">
              {seg.slice(1, -1)}
            </code>
          )
        }
        return <Fragment key={i}>{seg}</Fragment>
      })}
    </>
  )
}
