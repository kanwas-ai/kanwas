const DETACHED_MARKDOWN_REVEAL_CHARACTERS_PER_SECOND = 900
const DETACHED_MARKDOWN_REVEAL_BACKLOG_DIVISOR = 32
const DETACHED_MARKDOWN_REVEAL_MAX_BOUNDARY_EXTENSION = 18

function isDetachedMarkdownRevealBoundary(character: string | undefined): boolean {
  return character === undefined || /[\s.,!?;:()[\]{}<>"'`*_#|~-]/.test(character)
}

export function getNextDetachedMarkdownReveal(
  currentMarkdown: string,
  targetMarkdown: string,
  elapsedMs: number
): string {
  if (!targetMarkdown.startsWith(currentMarkdown)) {
    return targetMarkdown
  }

  if (currentMarkdown.length >= targetMarkdown.length) {
    return currentMarkdown
  }

  const remainingCharacters = targetMarkdown.length - currentMarkdown.length
  const baseAdvance = Math.max(1, Math.floor((elapsedMs * DETACHED_MARKDOWN_REVEAL_CHARACTERS_PER_SECOND) / 1_000))
  const backlogBonus = Math.floor(remainingCharacters / DETACHED_MARKDOWN_REVEAL_BACKLOG_DIVISOR)
  let nextLength = Math.min(targetMarkdown.length, currentMarkdown.length + baseAdvance + backlogBonus)

  if (nextLength < targetMarkdown.length) {
    const maxExtendedLength = Math.min(
      targetMarkdown.length,
      nextLength + DETACHED_MARKDOWN_REVEAL_MAX_BOUNDARY_EXTENSION
    )

    while (
      nextLength < maxExtendedLength &&
      !isDetachedMarkdownRevealBoundary(targetMarkdown[nextLength - 1]) &&
      !isDetachedMarkdownRevealBoundary(targetMarkdown[nextLength])
    ) {
      nextLength += 1
    }
  }

  return targetMarkdown.slice(0, nextLength)
}
