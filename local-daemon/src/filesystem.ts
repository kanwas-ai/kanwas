// Low-level filesystem utilities.
//
// COPIED (trimmed) from execenv/src/filesystem.ts. Deliberately DROPPED:
//   - clearDirectory()   — the boot wipe the daemon must never inherit
//   - writeFSNode()      — yDoc→folder hydration (not done in local-first)
//   - writeReadyMarker() — sandbox handshake
// Kept: read helpers, file identity (for the watcher), and metadata.yaml I/O.
import fs from 'node:fs/promises'
import path from 'node:path'
import * as yaml from 'yaml'
import { sanitizeCanvasMetadata, type CanvasMetadata } from 'shared'

export type { CanvasMetadata }

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory()
  } catch {
    return false
  }
}

export interface FileIdentitySnapshot {
  dev: number
  ino: number
  size: number
  mtimeMs: number
  isDirectory: boolean
}

/** Read filesystem identity used to pair unlink/add rename events. */
export async function readFileIdentity(filePath: string): Promise<FileIdentitySnapshot | undefined> {
  try {
    const stats = await fs.lstat(filePath)
    return {
      dev: stats.dev,
      ino: stats.ino,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isDirectory: stats.isDirectory(),
    }
  } catch {
    return undefined
  }
}

/** Read file content as UTF-8. Returns undefined if unreadable. */
export async function readFileContent(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

/** Read file content as a binary Buffer. */
export async function readFileBinary(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath)
}

/** Serialize `metadata` for a canvas directory (deterministic, sanitized). */
export function serializeMetadata(metadata: CanvasMetadata): string {
  const sanitized = isObjectRecord(metadata)
    ? sanitizeCanvasMetadata(metadata as unknown as Record<string, unknown>)
    : metadata
  return yaml.stringify(sanitized)
}

export interface WriteMetadataOptions {
  /**
   * Create `canvasDir` if it doesn't exist. Default false: a missing directory
   * means the canvas's real home vanished (e.g. a `git mv` raced a stale sync
   * event) and writing here would resurrect a directory that was just renamed
   * or deleted away — the "ghost sidecar" defect. Only boot-time materialization
   * (a canvas that has never had a sidecar) and the flusher's own structural
   * reconcile — which just created the directory itself — may pass `true`.
   */
  createDir?: boolean
}

export interface WriteMetadataResult {
  /** The metadata.yaml content (existing-and-matching, or newly written). */
  content: string
  /** True when the write was skipped because `canvasDir` doesn't exist and
   *  `createDir` was not set. `content` is what WOULD have been written. */
  skipped: boolean
}

/**
 * Write metadata.yaml to a canvas directory. Idempotent: if the on-disk content
 * already matches, it does NOT write (so it never produces a spurious watcher
 * event).
 */
export async function writeMetadataYaml(
  canvasDir: string,
  metadata: CanvasMetadata,
  options: WriteMetadataOptions = {}
): Promise<WriteMetadataResult> {
  const content = serializeMetadata(metadata)
  const metadataPath = path.join(canvasDir, 'metadata.yaml')

  try {
    const existing = await fs.readFile(metadataPath, 'utf-8')
    if (existing === content) return { content: existing, skipped: false }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') throw error
  }

  if (options.createDir) {
    await fs.mkdir(canvasDir, { recursive: true })
  } else if (!(await isDirectory(canvasDir))) {
    return { content, skipped: true }
  }

  await fs.writeFile(metadataPath, content, 'utf-8')
  return { content, skipped: false }
}

/**
 * Read and parse metadata.yaml from a canvas directory.
 * Returns undefined when missing; throws for invalid YAML.
 */
export async function readMetadataYaml(canvasDir: string): Promise<CanvasMetadata | undefined> {
  const metadataPath = path.join(canvasDir, 'metadata.yaml')

  let content: string
  try {
    content = await fs.readFile(metadataPath, 'utf-8')
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') return undefined
    throw error
  }

  try {
    const parsed = yaml.parse(content)
    return isObjectRecord(parsed)
      ? (sanitizeCanvasMetadata(parsed) as unknown as CanvasMetadata)
      : (parsed as CanvasMetadata)
  } catch {
    throw new Error(`Invalid metadata.yaml at ${metadataPath}`)
  }
}

/** True if a canvas directory already has a metadata.yaml. */
export async function hasMetadataYaml(canvasDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(canvasDir, 'metadata.yaml'))
    return true
  } catch {
    return false
  }
}
