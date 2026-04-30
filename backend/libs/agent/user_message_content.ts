import drive from '@adonisjs/drive/services/main'
import type { ModelMessage } from 'ai'
import type { Context } from './types.js'

type UserContentPart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image'
      image: string
      mediaType: string
    }
  | {
      type: 'file'
      data: string
      mediaType: string
    }

const SIGNED_URL_TTL = '7 days'
const REFRESH_WHEN_REMAINING_MS = 60 * 60 * 1000 // re-sign when <1 hour left

/** Matches R2 keys: invocations/<uuid>/<uuid>.<ext> */
const ATTACHMENT_KEY_PATTERN = /invocations\/[a-f0-9-]+\/[a-f0-9-]+\.[a-z0-9]+/i

function extractAttachmentKey(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.startsWith('data:')) {
    return null
  }
  const match = url.match(ATTACHMENT_KEY_PATTERN)
  return match ? match[0] : null
}

/** True if the presigned URL still has more than REFRESH_WHEN_REMAINING_MS of life. */
function isUrlStillFresh(url: string): boolean {
  try {
    const params = new URL(url).searchParams
    const amzDate = params.get('X-Amz-Date')
    const amzExpires = params.get('X-Amz-Expires')
    if (!amzDate || !amzExpires) return false

    const m = amzDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (!m) return false

    const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
    const expiresAt = signedAt + Number.parseInt(amzExpires, 10) * 1000
    return expiresAt - Date.now() > REFRESH_WHEN_REMAINING_MS
  } catch {
    return false
  }
}

export async function buildUserMessageContent(params: {
  context: Context
  userMessage: string
  contextSection: string
}): Promise<string | UserContentPart[]> {
  const { context, userMessage, contextSection } = params
  const messageText = contextSection ? `${contextSection}\n\n<task>\n${userMessage}\n</task>` : userMessage

  if (!context.uploadedFiles || context.uploadedFiles.length === 0) {
    return messageText
  }

  const contentParts: UserContentPart[] = [{ type: 'text', text: messageText }]
  const disk = drive.use()

  for (const file of context.uploadedFiles) {
    const signedUrl = await disk.getSignedUrl(file.path, { expiresIn: SIGNED_URL_TTL })
    const isImage = file.mimeType.startsWith('image/')

    if (isImage) {
      contentParts.push({
        type: 'image',
        image: signedUrl,
        mediaType: file.mimeType,
      })
      continue
    }

    contentParts.push({
      type: 'file',
      data: signedUrl,
      mediaType: file.mimeType,
    })
  }

  return contentParts
}

type AttachmentLogger = { warn: (ctx: Record<string, unknown>, msg: string) => void }

/**
 * Re-signs all R2 attachment URLs in persisted message history.
 * With 7-day TTL this only matters for very old chats. If re-signing fails
 * (e.g. R2 object deleted), the attachment part is dropped silently.
 */
export async function refreshPersistedAttachmentUrls(
  messages: ModelMessage[],
  options: { logger?: AttachmentLogger } = {}
): Promise<{ messages: ModelMessage[]; changed: boolean }> {
  if (!messages || messages.length === 0) {
    return { messages, changed: false }
  }

  const disk = drive.use()
  const result: ModelMessage[] = []
  let changed = false

  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      result.push(message)
      continue
    }

    const rewrittenParts: unknown[] = []
    let messageMutated = false

    for (const part of message.content as unknown[]) {
      const typed = part as Record<string, unknown> | null
      if (!typed || typeof typed !== 'object' || !typed.type) {
        rewrittenParts.push(part)
        continue
      }

      const isImage = typed.type === 'image'
      const isFile = typed.type === 'file'
      if (!isImage && !isFile) {
        rewrittenParts.push(part)
        continue
      }

      const currentUrl = isImage ? typed.image : typed.data
      const key = extractAttachmentKey(currentUrl)
      if (!key) {
        rewrittenParts.push(part)
        continue
      }

      if (typeof currentUrl === 'string' && isUrlStillFresh(currentUrl)) {
        rewrittenParts.push(part)
        continue
      }

      try {
        const freshUrl = await disk.getSignedUrl(key, { expiresIn: SIGNED_URL_TTL })
        rewrittenParts.push({ ...typed, [isImage ? 'image' : 'data']: freshUrl })
        messageMutated = true
      } catch (error) {
        messageMutated = true
        options.logger?.warn(
          { attachmentKey: key, err: error instanceof Error ? error : new Error(String(error)) },
          'Dropping attachment: could not re-sign URL'
        )
      }
    }

    if (!messageMutated) {
      result.push(message)
      continue
    }

    changed = true

    if (rewrittenParts.length === 0) {
      rewrittenParts.push({ type: 'text', text: '[attachment unavailable]' })
    }

    result.push({ ...message, content: rewrittenParts as typeof message.content } as ModelMessage)
  }

  return { messages: changed ? result : messages, changed }
}
