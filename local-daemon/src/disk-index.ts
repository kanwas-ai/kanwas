// Current on-disk identity index: canvasId → dir, nodeId → file.
//
// The flusher reconciles the desired yDoc tree against what is actually on disk.
// To do that it must know which real file currently backs each node id and which
// real directory backs each canvas id — the pre-edit layout. That mapping lives
// in the `metadata.yaml` sidecars (they store node/canvas ids + names), paired
// with the real filenames on disk (the daemon never renames the user's files to
// their sanitized form, so `README.md` must be recovered by name-matching).
//
// This is the inverse of disk-align: disk-align maps the LIVE (post-edit) tree to
// disk by sanitized name; DiskIndex maps ids to their CURRENT on-disk paths using
// the stored sidecars, which survives a UI rename (sidecar still holds the old
// name) so the flusher can compute old→new and move the file instead of orphaning
// it. File-backed node kinds only: blockNote (.md) and stickyNote (.sticky.yaml)
// carry content in files; text/link live purely in metadata; binaries are matched
// by their storagePath basename.
import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'yaml'
import type { CanvasMetadata } from 'shared'
import { KANWAS_DIR } from './identity.js'
import { matchNodeFile } from './name-match.js'

const SKIP = new Set(['.git', 'node_modules', '.DS_Store', KANWAS_DIR])

export interface DiskIndex {
  /** canvasId → folder-relative directory ('' = root). */
  canvasIdToDir: Map<string, string>
  /** nodeId → folder-relative file path (file-backed nodes only). */
  nodeIdToFile: Map<string, string>
}

type MetaNode = CanvasMetadata['nodes'][number]

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidMetadata(m: unknown): m is CanvasMetadata {
  return (
    isObjectRecord(m) &&
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    Array.isArray(m.nodes) &&
    isObjectRecord(m.xynode)
  )
}

/** Find the real on-disk file backing a metadata node (see name-match.ts for the rule). */
function matchMetaNodeFile(node: MetaNode, files: string[]): string | undefined {
  return matchNodeFile(
    {
      type: node.xynode.type,
      name: node.name,
      storagePath: (node.xynode.data as { storagePath?: unknown } | undefined)?.storagePath,
    },
    files
  )
}

function readDir(abs: string): { dirs: string[]; files: string[] } {
  const dirs: string[] = []
  const files: string[] = []
  try {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue
      if (e.isDirectory()) dirs.push(e.name)
      else if (e.name !== 'metadata.yaml') files.push(e.name)
    }
  } catch {
    /* dir gone */
  }
  return { dirs, files }
}

function readMetadata(dirAbs: string): CanvasMetadata | undefined {
  try {
    const parsed = yaml.parse(fs.readFileSync(path.join(dirAbs, 'metadata.yaml'), 'utf-8'))
    return isValidMetadata(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Walk the folder and build the current identity index from `metadata.yaml`
 * sidecars paired with real filenames. Only directories reachable from the root
 * (and each with a metadata.yaml, or nested under one) are indexed; the root dir
 * ('') is always the root canvas even without a sidecar.
 */
export function buildDiskIndex(folder: string, rootCanvasId: string): DiskIndex {
  const canvasIdToDir = new Map<string, string>()
  const nodeIdToFile = new Map<string, string>()

  const walk = (abs: string, rel: string, canvasId: string): void => {
    canvasIdToDir.set(canvasId, rel)
    const { dirs, files } = readDir(abs)
    const meta = readMetadata(abs)
    if (meta) {
      for (const node of meta.nodes) {
        if (!isObjectRecord(node) || typeof node.id !== 'string' || !isObjectRecord(node.xynode)) continue
        const file = matchMetaNodeFile(node, files)
        if (file) nodeIdToFile.set(node.id, rel ? `${rel}/${file}` : file)
      }
    }
    for (const childName of dirs) {
      const childAbs = path.join(abs, childName)
      const childRel = rel ? `${rel}/${childName}` : childName
      const childMeta = readMetadata(childAbs)
      const childId = childMeta ? childMeta.id : `dir:${childRel}`
      walk(childAbs, childRel, childId)
    }
  }

  walk(folder, '', rootCanvasId)
  return { canvasIdToDir, nodeIdToFile }
}
