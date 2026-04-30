import { createHash } from 'node:crypto'
import type { ModelMessage } from 'ai'

export function buildMessagesHash(messages: ModelMessage[]): string {
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex').slice(0, 16)
}
