import type { SuggestedTasksItem } from 'backend/agent'
import type { WorkspaceSuggestedTask } from '@/api/suggestedTasks'
import thinkingAnimation from '@/assets/thinking-animation.png'
import { SuggestedTaskButtonRow } from './SuggestedTaskButtonRow'

const EMPTY_PENDING_IDS: ReadonlySet<string> = new Set()

interface SuggestedTasksTimelineItemProps {
  item: SuggestedTasksItem
  startingSuggestedTaskIds?: ReadonlySet<string>
  deletingSuggestedTaskIds?: ReadonlySet<string>
  onSuggestedTaskStart?: (task: WorkspaceSuggestedTask) => void
}

function ScopeBadge({ item }: { item: SuggestedTasksItem }) {
  if (item.scope !== 'local') {
    return null
  }

  return (
    <span className="shrink-0 rounded-full border border-chat-pill-border bg-chat-clear px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-muted">
      Chat only
    </span>
  )
}

export function SuggestedTasksTimelineItem({
  item,
  startingSuggestedTaskIds,
  deletingSuggestedTaskIds,
  onSuggestedTaskStart,
}: SuggestedTasksTimelineItemProps) {
  const resolvedStartingSuggestedTaskIds = startingSuggestedTaskIds ?? EMPTY_PENDING_IDS
  const resolvedDeletingSuggestedTaskIds = deletingSuggestedTaskIds ?? EMPTY_PENDING_IDS

  if (item.status === 'loading') {
    return (
      <div className="w-full overflow-hidden rounded-[var(--chat-radius)] border border-chat-pill-border bg-chat-pill p-4 shadow-chat-pill">
        <div className="flex items-start gap-3">
          <img src={thinkingAnimation} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 select-none" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Thinking through your next steps...</p>
              <ScopeBadge item={item} />
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              I'm turning what we've covered into a few concrete next tasks.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (item.status === 'failed') {
    return (
      <div className="w-full overflow-hidden rounded-[var(--chat-radius)] border border-status-error/25 bg-chat-pill p-4 shadow-chat-pill">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-status-error" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                {item.scope === 'global' ? 'Could not save suggested tasks' : 'Could not prepare suggested tasks'}
              </p>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{item.error ?? 'Please try again in a moment.'}</p>
          </div>
          <ScopeBadge item={item} />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-[var(--chat-radius)] border border-chat-pill-border bg-chat-pill shadow-chat-pill">
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Great - want to keep going?</p>
          <p className="mt-1 text-sm text-foreground-muted">
            {item.scope === 'global'
              ? 'I turned this into a few strong next steps. Pick one to start.'
              : 'I pulled out a few next steps from this chat. Pick one to keep going.'}
          </p>
        </div>
        <ScopeBadge item={item} />
      </div>

      <div className="pb-2">
        {item.tasks.map((task) => (
          <SuggestedTaskButtonRow
            key={task.id}
            task={task}
            isStarting={resolvedStartingSuggestedTaskIds.has(task.id)}
            isDeleting={resolvedDeletingSuggestedTaskIds.has(task.id)}
            onStart={onSuggestedTaskStart}
          />
        ))}
      </div>
    </div>
  )
}
