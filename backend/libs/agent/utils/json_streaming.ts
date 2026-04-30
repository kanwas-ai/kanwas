/**
 * Utilities for parsing streaming/partial JSON from LLM responses.
 */

/**
 * Extract a string field from partial/incomplete JSON.
 *
 * This is used during streaming to extract field values before the full JSON
 * is complete. For example, extracting "message" from:
 *   {"message": "Searching for...
 *
 * @param argsText - The partial or complete JSON string
 * @param fieldName - The field name to extract
 * @returns The unescaped string value, or null if field not found/not a string
 */
export function extractJsonStringField(argsText: string, fieldName: string): string | null {
  // Try complete JSON first
  try {
    const parsed = JSON.parse(argsText)
    const value = parsed[fieldName]
    // Only return if it's actually a string
    if (typeof value === 'string') {
      return value
    }
    return null
  } catch {
    // JSON incomplete - extract partial string value with regex
    // Matches: "fieldName": "value... (including escaped chars)
    const regex = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's')
    const match = argsText.match(regex)
    if (match) {
      return unescapeJsonStringFragment(match[1])
    }
    return null
  }
}

/**
 * Extract a string array field from complete or partial JSON.
 *
 * For partial JSON, returns any fully parsed items plus the current in-progress
 * string item if one has started streaming.
 */
export function extractJsonStringArrayField(argsText: string, fieldName: string): string[] | null {
  if (!argsText || !fieldName) {
    return null
  }

  try {
    const parsed = JSON.parse(argsText)
    const value = parsed[fieldName]

    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return null
    }

    return value as string[]
  } catch {
    const fieldPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\[`, 's')
    const match = fieldPattern.exec(argsText)
    if (!match) {
      return null
    }

    let i = match.index + match[0].length
    const values: string[] = []

    while (i < argsText.length) {
      while (i < argsText.length && (isJsonWhitespace(argsText[i]) || argsText[i] === ',')) {
        i += 1
      }

      if (i >= argsText.length) {
        return values.length > 0 ? values : null
      }

      if (argsText[i] === ']') {
        return values
      }

      if (argsText[i] !== '"') {
        return values.length > 0 ? values : null
      }

      i += 1
      let token = ''
      let escaping = false
      let closed = false

      while (i < argsText.length) {
        const char = argsText[i]

        if (escaping) {
          token += char
          escaping = false
          i += 1
          continue
        }

        if (char === '\\') {
          escaping = true
          i += 1
          continue
        }

        if (char === '"') {
          closed = true
          i += 1
          break
        }

        token += char
        i += 1
      }

      values.push(unescapeJsonStringFragment(token))

      if (!closed) {
        return values
      }
    }

    return values.length > 0 ? values : null
  }
}

/**
 * Extract a string field from a nested JSON path in complete or partial JSON.
 *
 * For incomplete JSON we fall back to matching the terminal field name, which is
 * sufficient for the streaming payloads we use today.
 */
export function extractJsonStringFieldAtPath(argsText: string, fieldPath: string[]): string | null {
  if (fieldPath.length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(argsText)
    let current: unknown = parsed

    for (const segment of fieldPath) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return null
      }
      current = (current as Record<string, unknown>)[segment]
    }

    return typeof current === 'string' ? current : null
  } catch {
    return extractJsonStringField(argsText, fieldPath[fieldPath.length - 1])
  }
}

/**
 * Extract an object field from complete or partial JSON.
 *
 * For incomplete JSON, this returns once the target object is structurally
 * complete, even if later sibling fields are still streaming.
 */
export function extractJsonObjectField<T extends Record<string, unknown> = Record<string, unknown>>(
  argsText: string,
  fieldName: string
): T | null {
  if (!argsText || !fieldName) {
    return null
  }

  try {
    const parsed = JSON.parse(argsText)
    const value = parsed[fieldName]
    return isPlainObject(value) ? (value as T) : null
  } catch {
    const fieldPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`, 's')
    const match = fieldPattern.exec(argsText)
    if (!match) {
      return null
    }

    const startIndex = match.index + match[0].lastIndexOf('{')
    const objectText = extractCompleteJsonObject(argsText, startIndex)
    if (!objectText) {
      return null
    }

    try {
      const parsedObject = JSON.parse(objectText)
      return isPlainObject(parsedObject) ? (parsedObject as T) : null
    } catch {
      return null
    }
  }
}

/**
 * Detect whether a field key has started appearing in partial/incomplete JSON.
 *
 * Useful for phase transitions while streaming tool arguments, where we only
 * need to know that a key like "questions" has started, not parse its value.
 */
export function hasJsonFieldStarted(argsText: string, fieldName: string): boolean {
  if (!argsText || !fieldName) {
    return false
  }

  try {
    const parsed = JSON.parse(argsText)
    if (parsed && typeof parsed === 'object') {
      return Object.prototype.hasOwnProperty.call(parsed, fieldName)
    }
    return false
  } catch {
    return hasJsonFieldKeyOutsideStrings(argsText, fieldName)
  }
}

function hasJsonFieldKeyOutsideStrings(argsText: string, fieldName: string): boolean {
  let i = 0

  while (i < argsText.length) {
    if (argsText[i] !== '"') {
      i += 1
      continue
    }

    i += 1
    let token = ''
    let escaped = false
    let closed = false

    while (i < argsText.length) {
      const char = argsText[i]

      if (escaped) {
        token += char
        escaped = false
        i += 1
        continue
      }

      if (char === '\\') {
        escaped = true
        i += 1
        continue
      }

      if (char === '"') {
        closed = true
        i += 1
        break
      }

      token += char
      i += 1
    }

    if (!closed) {
      return false
    }

    while (i < argsText.length && isJsonWhitespace(argsText[i])) {
      i += 1
    }

    if (i < argsText.length && argsText[i] === ':' && token === fieldName) {
      return true
    }
  }

  return false
}

function extractCompleteJsonObject(argsText: string, startIndex: number): string | null {
  let depth = 0
  let inString = false
  let escaping = false

  for (let i = startIndex; i < argsText.length; i += 1) {
    const char = argsText[i]

    if (escaping) {
      escaping = false
      continue
    }

    if (char === '\\') {
      if (inString) {
        escaping = true
      }
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return argsText.slice(startIndex, i + 1)
      }
    }
  }

  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function unescapeJsonStringFragment(value: string): string {
  // Unescape JSON string escapes - must process each escape ONCE.
  // Using single-pass replace correctly preserves literal backslash sequences.
  return value.replace(/\\(.)/g, (_, char) => {
    switch (char) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case '"':
        return '"'
      case '\\':
        return '\\'
      default:
        return char
    }
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isJsonWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
}
