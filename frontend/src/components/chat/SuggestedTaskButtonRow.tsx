import type { WorkspaceSuggestedTask } from '@/api/suggestedTasks'

const TASK_TITLE_CLASS = 'truncate text-[16px] leading-[20px] font-semibold text-foreground'
const TASK_DESCRIPTION_CLASS = 'mt-[2px] truncate text-sm text-sidebar-item-text'
const TASK_ROW_LAYOUT_CLASS = 'px-[18px] py-[6px]'
const TASK_META_CLASS = 'shrink-0 text-[12px] text-sidebar-icon transition-opacity duration-150'

interface SuggestedTaskButtonRowProps {
  task: WorkspaceSuggestedTask
  isStarting: boolean
  isDeleting?: boolean
  onStart?: (task: WorkspaceSuggestedTask) => void
  onDelete?: (task: WorkspaceSuggestedTask) => void
}

export function SuggestedTaskButtonRow({
  task,
  isStarting,
  isDeleting = false,
  onStart,
  onDelete,
}: SuggestedTaskButtonRowProps) {
  const isBusy = isStarting || isDeleting
  const canDelete = !!onDelete
  const canRevealDelete = canDelete && !isBusy
  const metaLabel = isStarting ? 'Starting' : isDeleting ? 'Removing' : 'Start'

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onStart?.(task)}
        disabled={!onStart || isBusy}
        className={`w-full ${TASK_ROW_LAYOUT_CLASS} bg-transparent text-left transition-colors duration-150 hover:bg-sidebar-selection cursor-pointer disabled:cursor-default disabled:opacity-70`}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-chat-pill-border bg-chat-clear text-[16px]"
            aria-hidden="true"
          >
            {task.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className={TASK_TITLE_CLASS}>{task.headline}</p>
                <p className={TASK_DESCRIPTION_CLASS}>{task.description}</p>
              </div>
              <span
                className={`${TASK_META_CLASS} pt-0.5 ${canRevealDelete ? 'group-hover:opacity-0 group-focus-within:opacity-0' : ''}`}
              >
                {metaLabel}
              </span>
            </div>
          </div>
        </div>
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDelete(task)
          }}
          disabled={isBusy}
          title="Delete suggestion"
          aria-label={`Delete suggestion ${task.headline}`}
          className={`absolute right-[8px] top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-150 ${
            isDeleting
              ? 'pointer-events-none scale-100 opacity-100'
              : canRevealDelete
                ? 'pointer-events-none scale-90 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100'
                : 'pointer-events-none scale-90 opacity-0'
          }`}
        >
          <i
            className={`${isDeleting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-xmark'} text-[13px] text-foreground-muted transition-colors ${isDeleting ? '' : 'hover:text-status-error'}`}
          />
        </button>
      )}
    </div>
  )
}
