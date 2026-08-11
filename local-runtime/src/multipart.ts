// A minimal, dependency-free multipart/form-data parser.
//
// The only client is the renderer's upload hook (`useUploadImage`), which
// posts `POST /workspaces/:id/files` via ky/object-to-formdata with exactly three
// fields — `file` (the binary), `canvas_id`, `filename`. We parse that shape
// rather than pull a streaming multipart dependency into the runtime (which serves
// on raw node:http). The parser is buffer-based and binary-safe.

export interface MultipartFile {
  /** The form field name (e.g. "file"). */
  field: string
  /** The client-provided filename, if any. */
  filename?: string
  /** The part's Content-Type header, if any. */
  contentType?: string
  /** Raw bytes of the part. */
  data: Buffer
}

export interface ParsedMultipart {
  /** Text fields (last value wins for duplicate names). */
  fields: Record<string, string>
  /** File parts (parts that carried a `filename`). */
  files: MultipartFile[]
}

/** Extract the boundary token from a Content-Type header value. */
export function parseBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null
  // boundary=..., optionally quoted; stops at ';'
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const raw = match?.[1] ?? match?.[2]
  return raw ? raw.trim() : null
}

function parsePartHeaders(headerText: string): {
  field?: string
  filename?: string
  contentType?: string
} {
  const result: { field?: string; filename?: string; contentType?: string } = {}
  for (const line of headerText.split(/\r\n/)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const name = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (name === 'content-disposition') {
      result.field = /name="([^"]*)"/i.exec(value)?.[1] ?? /name=([^;]+)/i.exec(value)?.[1]?.trim()
      const fn = /filename\*?="?([^";]*)"?/i.exec(value)?.[1]
      if (fn !== undefined) result.filename = fn
    } else if (name === 'content-type') {
      result.contentType = value
    }
  }
  return result
}

/**
 * Parse a multipart/form-data body. Returns null if the body is not well-formed
 * for the given boundary. Binary-safe (never decodes file bytes as text).
 */
export function parseMultipart(body: Buffer, boundary: string): ParsedMultipart | null {
  const delimiter = Buffer.from(`--${boundary}`)
  const fields: Record<string, string> = {}
  const files: MultipartFile[] = []

  // Find the first delimiter; bail if absent.
  let start = body.indexOf(delimiter)
  if (start === -1) return null

  while (start !== -1) {
    // Move past the delimiter.
    let cursor = start + delimiter.length
    // A closing delimiter is followed by "--".
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) break
    // Skip the CRLF after the delimiter.
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) cursor += 2

    // Headers end at the first blank line (CRLFCRLF).
    const headerEnd = body.indexOf('\r\n\r\n', cursor)
    if (headerEnd === -1) break
    const headerText = body.toString('utf-8', cursor, headerEnd)
    const contentStart = headerEnd + 4

    // The next delimiter marks the end of this part's content.
    const nextDelimiter = body.indexOf(delimiter, contentStart)
    if (nextDelimiter === -1) break
    // Trim the trailing CRLF that precedes the delimiter.
    let contentEnd = nextDelimiter
    if (body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) contentEnd -= 2

    const { field, filename, contentType } = parsePartHeaders(headerText)
    const data = body.subarray(contentStart, contentEnd)
    if (field !== undefined) {
      if (filename !== undefined) {
        files.push({ field, filename, contentType, data: Buffer.from(data) })
      } else {
        fields[field] = data.toString('utf-8')
      }
    }

    start = nextDelimiter
  }

  return { fields, files }
}

/** Read an entire request body into a Buffer, capped at `maxBytes`. */
export function readRequestBody(
  req: NodeJS.ReadableStream,
  maxBytes: number
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        truncated = true
        req.removeAllListeners('data')
        resolve({ body: Buffer.concat(chunks), truncated })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ body: Buffer.concat(chunks), truncated }))
    req.on('error', reject)
  })
}
