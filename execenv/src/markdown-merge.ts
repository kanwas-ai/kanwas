import diff3Merge from 'diff3'

export type MarkdownMergeResult =
  | { status: 'merged'; content: string }
  | { status: 'conflict' }
  | { status: 'error'; error: string }

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

function normalizeForMerge(content: string): string {
  const normalized = normalizeLineEndings(content)
  if (normalized.length === 0) {
    return normalized
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function toLines(content: string): string[] {
  return normalizeForMerge(content).split('\n')
}

function areEqualLines(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

/**
 * Merge markdown text using a line-based 3-way merge.
 *
 * `base` is the common ancestor snapshot.
 * `incoming` is the filesystem change being applied.
 * `current` is latest canonical content derived from yDoc.
 */
export function mergeMarkdown3Way(base: string, incoming: string, current: string): MarkdownMergeResult {
  try {
    const baseLines = toLines(base)
    const incomingLines = toLines(incoming)
    const currentLines = toLines(current)

    const mergedChunks = diff3Merge(incomingLines, baseLines, currentLines)
    const mergedLines: string[] = []

    for (const chunk of mergedChunks) {
      if (chunk.ok) {
        mergedLines.push(...chunk.ok)
        continue
      }

      const conflict = chunk.conflict
      if (!conflict) {
        continue
      }

      // Auto-resolve degenerate conflicts when one branch equals base
      // or both branches converged to the same result.
      if (areEqualLines(conflict.a, conflict.b)) {
        mergedLines.push(...conflict.a)
        continue
      }

      if (areEqualLines(conflict.a, conflict.o)) {
        mergedLines.push(...conflict.b)
        continue
      }

      if (areEqualLines(conflict.b, conflict.o)) {
        mergedLines.push(...conflict.a)
        continue
      }

      return { status: 'conflict' }
    }

    return { status: 'merged', content: mergedLines.join('\n') }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 'error',
      error: message,
    }
  }
}
