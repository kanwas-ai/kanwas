import type { ModelMessage } from 'ai'

/**
 * Normalize replayed tool-call/tool-result parts so the current tool registry
 * can serialize them into a valid provider request.
 *
 * Two classes of problem are handled:
 *
 * 1. Invalid tool-call inputs. The AI SDK can retain string/null/array inputs
 *    after a tool validation failure, which providers reject on replay.
 *    OpenAI custom tools like `write_file` legitimately use raw string inputs.
 *
 * 2. Orphaned tool calls that reference a tool no longer registered. The
 *    @ai-sdk/openai Responses provider decides between `function_call` and
 *    `custom_tool_call` serialization based on the current tool set; when a
 *    historical item's tool has been removed or converted, the stored item ID
 *    (e.g. `ctc_...` from the original custom tool) ends up attached to a
 *    `function_call`, and the API 400s. Dropping the orphan part — along with
 *    its paired tool-result — keeps the conversation replayable.
 */
export function sanitizeToolCallInputs(messages: ModelMessage[], knownToolNames?: ReadonlySet<string>): ModelMessage[] {
  const droppedToolCallIds = new Set<string>()
  const sanitized: ModelMessage[] = []

  for (const message of messages) {
    const isContentArray =
      (message.role === 'assistant' || message.role === 'tool') &&
      typeof message.content !== 'string' &&
      Array.isArray(message.content)

    if (!isContentArray) {
      sanitized.push(message)
      continue
    }

    let modified = false
    const kept: any[] = []

    for (const part of message.content as any[]) {
      if (part.type === 'tool-call') {
        if (knownToolNames && !knownToolNames.has(part.toolName)) {
          droppedToolCallIds.add(part.toolCallId)
          modified = true
          continue
        }

        const input = part.input
        const isPlainObject =
          input !== null && input !== undefined && typeof input === 'object' && !Array.isArray(input)
        const preservesRawStringInput = part.toolName === 'write_file' && typeof input === 'string'

        if (isPlainObject || preservesRawStringInput) {
          kept.push(part)
          continue
        }

        modified = true

        if (typeof input === 'string') {
          try {
            const parsed = JSON.parse(input)
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              kept.push({ ...part, input: parsed })
              continue
            }
          } catch {
            // Ignore parse errors and fall back to empty object.
          }
        }

        kept.push({ ...part, input: {} })
        continue
      }

      if (part.type === 'tool-result') {
        const toolNameUnknown =
          knownToolNames && typeof part.toolName === 'string' && !knownToolNames.has(part.toolName)
        const pairOrphaned = typeof part.toolCallId === 'string' && droppedToolCallIds.has(part.toolCallId)
        if (toolNameUnknown || pairOrphaned) {
          modified = true
          continue
        }
      }

      kept.push(part)
    }

    if (!modified) {
      sanitized.push(message)
      continue
    }

    if (kept.length === 0) {
      continue
    }

    sanitized.push({ ...message, content: kept } as ModelMessage)
  }

  return sanitized
}
