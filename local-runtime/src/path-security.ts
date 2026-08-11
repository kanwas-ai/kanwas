import fs from 'node:fs'
import path from 'node:path'

export interface PathOperations {
  relative(from: string, to: string): string
  isAbsolute(value: string): boolean
  readonly sep: string
}

/** True when candidate is root itself or a descendant, never a sibling/prefix match. */
export function isPathInside(root: string, candidate: string, operations: PathOperations = path): boolean {
  const relative = operations.relative(root, candidate)
  return (
    relative === '' ||
    (!operations.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${operations.sep}`))
  )
}

/** Resolve an existing path and reject both lexical traversal and symlink escapes. */
export function resolveExistingPathInside(root: string, relativePath: string): string | null {
  const candidate = path.resolve(root, relativePath)
  if (!isPathInside(root, candidate)) return null
  try {
    const realRoot = fs.realpathSync(root)
    const realCandidate = fs.realpathSync(candidate)
    return isPathInside(realRoot, realCandidate) ? realCandidate : null
  } catch {
    return null
  }
}
