export const composioDetailCardClassName =
  'rounded-lg border border-chat-pill-border bg-chat-background/70 px-3 py-2.5 dark:border-outline/70 dark:bg-block-highlight/60'

export const composioCodeBlockClassName =
  'rounded-lg border border-chat-pill-border bg-chat-background/70 px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-64 overflow-y-auto dark:border-outline/70 dark:bg-block-highlight/60'

export function formatComposioDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

export function formatComposioToolkitName(toolkit: string) {
  if (!toolkit || toolkit === 'unknown') return 'Connected app'
  if (toolkit === 'mixed') return 'Connected apps'

  return toolkit.charAt(0).toUpperCase() + toolkit.slice(1)
}
