// Upload helpers: filename de-duplication and MIME resolution for
// `POST /workspaces/:id/files`. The daemon writes the uploaded bytes straight
// into the target canvas directory on disk; the frontend then puts the returned
// storagePath on the node it creates.
import { BINARY_FILE_TYPES, type BinaryFileExtension } from 'shared/server'

export interface UploadRequest {
  canvasId: string
  filename: string
  buffer: Buffer
  mimeType: string
}

export interface UploadResult {
  /** Workspace-relative path the frontend puts on the node (served by /files/raw). */
  storagePath: string
  mimeType: string
  size: number
  /** The final (possibly de-duplicated) filename on disk. */
  filename: string
}

/** A handler that persists an upload and returns where it landed. */
export type UploadHandler = (request: UploadRequest) => Promise<UploadResult>

/** Split a filename into `{ stem, ext }` where ext keeps its leading dot ('' if none). */
function splitExtension(filename: string): { stem: string; ext: string } {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return { stem: filename, ext: '' }
  return { stem: filename.slice(0, dot), ext: filename.slice(dot) }
}

/**
 * Ensure `filename` does not collide (case-insensitively) with any name in
 * `existingLower` (a set of already-used lowercased basenames). Appends `-1`,
 * `-2`, … before the extension until unique. Mutates `existingLower`.
 */
export function dedupeFilename(filename: string, existingLower: Set<string>): string {
  if (!existingLower.has(filename.toLowerCase())) {
    existingLower.add(filename.toLowerCase())
    return filename
  }
  const { stem, ext } = splitExtension(filename)
  let suffix = 1
  let candidate = `${stem}-${suffix}${ext}`
  while (existingLower.has(candidate.toLowerCase())) {
    suffix++
    candidate = `${stem}-${suffix}${ext}`
  }
  existingLower.add(candidate.toLowerCase())
  return candidate
}

/**
 * Resolve the stored MIME type for an upload. Prefers the extension mapping
 * (authoritative, matches how binary nodes are created elsewhere), falling back
 * to the client-provided type, then octet-stream.
 */
export function mimeTypeForUpload(filename: string, clientType?: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const byExt = ext ? BINARY_FILE_TYPES[ext as BinaryFileExtension]?.mimeType : undefined
  if (byExt) return byExt
  if (clientType && clientType.length > 0 && clientType !== 'application/octet-stream') return clientType
  return 'application/octet-stream'
}
