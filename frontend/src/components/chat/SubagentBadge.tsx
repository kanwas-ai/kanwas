/**
 * Subtle gray pill badge indicating a timeline item is from a subagent.
 * Usage: {item.agent?.source === 'subagent' && <SubagentBadge />}
 */
export function SubagentBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
      <span className="text-[12px]">↳</span>
      <span>Subagent</span>
    </span>
  )
}
