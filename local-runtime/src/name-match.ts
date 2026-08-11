// The single source of truth for node ↔ on-disk-filename matching.
//
// Two places bridge yDoc-node identity to real filenames on disk:
//   - disk-index.ts (identity index from metadata.yaml sidecars: nodeId → file)
//   - disk-align.ts (aligns the live PathMapper to the real files on disk)
// Both previously carried their OWN copy of the matching rule and they had DRIFTED:
// disk-index sanitized BOTH the filename stem and the node name before comparing
// (correct — a UI-created node stores the display name "New Document" while its
// file stem is the sanitized "new-document"), while disk-align compared the
// sanitized stem against the RAW node name (`sanitizeFilename(stem) === node.name`).
// That one-sided compare silently failed for any node whose stored name was not
// already in sanitized form, breaking the live PathMapper alignment (duplicate
// nodes on external edits). Unifying the rule here — and sanitizing BOTH sides —
// removes that whole class of latent bug.
//
// Matching policy (one node → at most one backing file):
//   - blockNote  → `<stem>.md`             where sanitize(stem) === sanitize(name)
//   - stickyNote → `<stem>.sticky.yaml`    "
//   - text       → `<stem>.text.yaml`      "
//   - link       → `<stem>.url.yaml`       "
//   - image/file/audio (binary) → basename(storagePath), exact then case-insensitive
//   - canvas / anything else → no backing file
//
// Extensions are matched case-insensitively (macOS/Windows filesystems), and the
// compound `.sticky.yaml` / `.text.yaml` / `.url.yaml` forms are checked before
// the bare `.md`/`.yaml` forms would ever apply.
import { sanitizeFilename } from 'shared'

/** Broad class of a node's on-disk representation. */
export type NodeFileClass = 'markdown' | 'sticky' | 'text' | 'url' | 'binary' | 'none'

const CONTENT_EXTENSION: Record<string, string> = {
  blockNote: '.md',
  stickyNote: '.sticky.yaml',
  text: '.text.yaml',
  link: '.url.yaml',
}

const BINARY_TYPES = new Set(['image', 'file', 'audio'])

/** The on-disk content extension a node type carries, or null for binary/metadata-only. */
export function contentExtensionForType(type: string): string | null {
  return CONTENT_EXTENSION[type] ?? null
}

/** Classify a node type by how it is represented on disk. */
export function nodeFileClass(type: string): NodeFileClass {
  switch (type) {
    case 'blockNote':
      return 'markdown'
    case 'stickyNote':
      return 'sticky'
    case 'text':
      return 'text'
    case 'link':
      return 'url'
    default:
      return BINARY_TYPES.has(type) ? 'binary' : 'none'
  }
}

/** Strip a known content extension from a filename, returning the stem (or null if it doesn't match). */
export function stripContentExtension(filename: string, extension: string): string | null {
  const lower = filename.toLowerCase()
  if (!lower.endsWith(extension.toLowerCase())) return null
  return filename.slice(0, filename.length - extension.length)
}

/**
 * True when `filename` (a basename) is the file backing a content node whose type
 * carries `extension` and whose stored name is `name`. Sanitizes BOTH the stem and
 * the name so display names ("New Document") match their sanitized files.
 */
export function contentFileMatchesName(filename: string, extension: string, name: string): boolean {
  const stem = stripContentExtension(filename, extension)
  if (stem === null) return false
  return sanitizeFilename(stem) === sanitizeFilename(name)
}

/** The basename a binary node's storagePath points at, or undefined. */
export function binaryStorageBasename(storagePath: unknown): string | undefined {
  if (typeof storagePath !== 'string' || storagePath.length === 0) return undefined
  return storagePath.split('/').pop() || undefined
}

/** Find the binary file in `files` for a given storagePath (exact, then case-insensitive). */
export function matchBinaryFile(storagePath: unknown, files: string[]): string | undefined {
  const base = binaryStorageBasename(storagePath)
  if (!base) return undefined
  if (files.includes(base)) return base
  const lower = base.toLowerCase()
  return files.find((f) => f.toLowerCase() === lower)
}

export interface NodeFileDescriptor {
  type: string
  name: string
  /** For binary nodes only: xynode.data.storagePath. */
  storagePath?: unknown
}

/**
 * Find the single file in `files` (basenames within one directory) that backs
 * `node`, or undefined. Content nodes match by sanitized-stem === sanitized-name;
 * binary nodes match by storagePath basename.
 */
export function matchNodeFile(node: NodeFileDescriptor, files: string[]): string | undefined {
  const cls = nodeFileClass(node.type)
  if (cls === 'none') return undefined
  if (cls === 'binary') return matchBinaryFile(node.storagePath, files)
  const extension = contentExtensionForType(node.type)
  if (!extension) return undefined
  return files.find((f) => contentFileMatchesName(f, extension, node.name))
}
