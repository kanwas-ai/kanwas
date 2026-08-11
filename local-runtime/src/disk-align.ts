// Aligns a PathMapper to the ACTUAL filenames on disk.
//
// Why this exists: PathMapper.buildFromWorkspace() derives every file/dir path
// from the (sanitized, lower-kebab-case) node/canvas *name* — e.g. a node named
// "readme" maps to `readme.md`. But the local runtime adopts the user's folder and
// NEVER rewrites files, so the real file may be `README.md`. The sanitized path
// then fails to map back to the real file, which (a) breaks id-stability across
// restarts and (b) makes a live edit of `README.md` look like a brand-new file
// (duplicate node). This helper walks the proxy tree and the folder in tandem and
// re-registers each mapping under the real on-disk path.
import fs from 'node:fs'
import path from 'node:path'
import { PathMapper, sanitizeFilename } from 'shared'
import type { CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { matchNodeFile } from './name-match.js'

const SKIP = new Set(['.git', 'node_modules', '.DS_Store', '.kanwas'])

/** Find the real on-disk file backing a live node (see name-match.ts for the rule). */
function matchLiveNodeFile(node: NodeItem, files: string[]): string | undefined {
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

/**
 * Re-register canvas + node mappings under their real on-disk paths. Call AFTER
 * buildFromWorkspace (which seeds sanitized mappings that this overrides for any
 * name whose on-disk form differs from sanitizeFilename(name)).
 */
export function alignPathMapperToDisk(pm: PathMapper, root: CanvasItem | undefined, folder: string): void {
  if (!root) return
  const walk = (canvas: CanvasItem, rel: string): void => {
    pm.addCanvasMapping({ path: rel, canvasId: canvas.id, originalName: canvas.name })
    const dirAbs = rel === '' ? folder : path.join(folder, rel)
    const { dirs, files } = readDir(dirAbs)

    for (const item of canvas.items) {
      if (item.kind === 'node') {
        const f = matchLiveNodeFile(item, files)
        if (f) {
          pm.addMapping({
            path: rel ? `${rel}/${f}` : f,
            nodeId: item.id,
            canvasId: canvas.id,
            originalName: item.name,
            type: 'node',
          })
        }
      } else {
        const matchDir = dirs.find((d) => sanitizeFilename(d) === item.name) ?? dirs.find((d) => d === item.name)
        const childName = matchDir ?? sanitizeFilename(item.name)
        walk(item, rel ? `${rel}/${childName}` : childName)
      }
    }
  }
  walk(root, '')
}

/** buildFromWorkspace + align, the disk-aligned way to (re)build a PathMapper. */
export function rebuildDiskAlignedMappings(pm: PathMapper, proxy: WorkspaceDocument, folder: string): void {
  pm.buildFromWorkspace(proxy)
  alignPathMapperToDisk(pm, proxy.root, folder)
}
