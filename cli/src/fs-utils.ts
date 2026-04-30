import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import picomatch from 'picomatch'
import type { FSNode } from 'shared/server'

const DEFAULT_IGNORE = ['**/metadata.yaml']

export type IgnoreMatcher = (path: string) => boolean

/**
 * Compile ignore patterns into a reusable matcher.
 */
export function createIgnoreMatcher(userPatterns: string[] = []): IgnoreMatcher {
  const patterns = [...DEFAULT_IGNORE, ...userPatterns]
  return picomatch(patterns)
}

/**
 * Check if a relative path matches any ignore pattern.
 */
export function shouldIgnore(relPath: string, matcher: IgnoreMatcher): boolean {
  return matcher(relPath)
}

export function hashContent(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

/**
 * Write an FSNode tree to disk recursively.
 * For the root node (name === '.'), writes children directly into basePath.
 * Files matching the ignore matcher are skipped.
 * Folders are only created if they contain at least one non-ignored file.
 */
export async function writeFSNodeToDir(
  node: FSNode,
  basePath: string,
  matcher: IgnoreMatcher,
  prefix: string = ''
): Promise<number> {
  let count = 0

  if (node.name === '.' && node.type === 'folder') {
    if (node.children) {
      for (const child of node.children) {
        count += await writeFSNodeToDir(child, basePath, matcher, prefix)
      }
    }
    return count
  }

  const relPath = prefix ? `${prefix}/${node.name}` : node.name
  const nodePath = path.join(basePath, node.name)

  // Defense-in-depth: refuse to write outside the current parent (path traversal guard).
  const resolvedBase = path.resolve(basePath)
  const resolvedNode = path.resolve(nodePath)
  if (resolvedNode !== resolvedBase && !resolvedNode.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Refusing to write outside base directory: ${node.name}`)
  }

  if (node.type === 'folder') {
    // Recurse first, only create directory if children were written
    const childResults: { child: FSNode; count: number }[] = []
    if (node.children) {
      for (const child of node.children) {
        // Write children to a temp count first
        const childCount = await writeFSNodeToDir(child, nodePath, matcher, relPath)
        childResults.push({ child, count: childCount })
      }
    }
    const totalChildren = childResults.reduce((sum, r) => sum + r.count, 0)
    if (totalChildren > 0) {
      // Directory was already created by fs.writeFile's parent mkdir via recursive option
      // But ensure it exists in case of empty intermediate dirs
      await fs.mkdir(nodePath, { recursive: true })
    }
    count += totalChildren
  } else {
    if (shouldIgnore(relPath, matcher)) return count
    await fs.mkdir(path.dirname(nodePath), { recursive: true })
    await fs.writeFile(nodePath, node.data ?? '')
    count++
  }

  return count
}

/**
 * Flatten an FSNode tree into a map of relative path -> Buffer content.
 * If a matcher is provided, ignored files are excluded.
 */
export function flattenFSNode(node: FSNode, prefix: string = '', matcher?: IgnoreMatcher): Map<string, Buffer> {
  const result = new Map<string, Buffer>()

  if (node.type === 'folder') {
    const folderPath = node.name === '.' ? prefix : prefix ? `${prefix}/${node.name}` : node.name
    if (node.children) {
      for (const child of node.children) {
        const childEntries = flattenFSNode(child, folderPath, matcher)
        for (const [k, v] of childEntries) {
          result.set(k, v)
        }
      }
    }
  } else {
    const filePath = prefix ? `${prefix}/${node.name}` : node.name
    if (matcher && shouldIgnore(filePath, matcher)) return result
    result.set(filePath, node.data ?? Buffer.from(''))
  }

  return result
}

/**
 * Walk a local directory and return a map of relative path -> Buffer content.
 * Skips .kanwas.json, hidden files, and files matching the ignore matcher.
 */
export async function walkLocalDir(
  dir: string,
  prefix: string = '',
  matcher?: IgnoreMatcher
): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>()
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    // Skip hidden files and .kanwas.json
    if (entry.name.startsWith('.')) continue

    const fullPath = path.join(dir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Skip entire directory if all children would be ignored
      if (matcher && shouldIgnore(relPath + '/_', matcher)) continue
      const subEntries = await walkLocalDir(fullPath, relPath, matcher)
      for (const [k, v] of subEntries) {
        result.set(k, v)
      }
    } else {
      if (matcher && shouldIgnore(relPath, matcher)) continue
      const content = await fs.readFile(fullPath)
      result.set(relPath, content)
    }
  }

  return result
}
