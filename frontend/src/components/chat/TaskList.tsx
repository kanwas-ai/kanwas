import { useState, useMemo } from 'react'
import type { WorkspaceSuggestedTask } from '@/api/suggestedTasks'
import type { TaskListItem } from '@/api/tasks'
import type { WorkspaceOnboardingStatus } from '@/api/workspaces'
import thinkingAnimation from '@/assets/thinking-animation.png'
import tipImage from '@/assets/tip.png'
import { tips } from '@/constants/tips'
import { useWorkspaceSnapshot } from '@/providers/workspace'
import { resolveCanvasPath, findCanvasByPath, findCanvasById } from '@/lib/workspaceUtils'
import type { CanvasItem } from 'shared'
import { SuggestedTaskButtonRow } from './SuggestedTaskButtonRow'

interface TaskListProps {
  tasks: TaskListItem[]
  suggestedTasks: WorkspaceSuggestedTask[]
  onboardingStatus?: WorkspaceOnboardingStatus
  activeTaskId: string | null
  isLoading: boolean
  isSuggestedTasksLoading: boolean
  isOnboardingStarting?: boolean
  isError: boolean
  startingSuggestedTaskIds?: ReadonlySet<string>
  deletingSuggestedTaskIds?: ReadonlySet<string>
  onTaskSelect: (task: TaskListItem) => void
  onSuggestedTaskStart?: (task: WorkspaceSuggestedTask) => void
  onSuggestedTaskDelete?: (task: WorkspaceSuggestedTask) => void
  onOnboardingStart?: () => void
  onTaskArchive?: (task: TaskListItem) => void
  onTaskHover?: (task: TaskListItem) => void
  onCanvasSelect?: (canvasId: string) => void
  onRetry: () => void
}

const RUNNING_STATUSES: TaskListItem['status'][] = ['initiated', 'processing']
const EMPTY_PENDING_IDS: ReadonlySet<string> = new Set()

const TASK_STATUS_ICON_META: Partial<
  Record<
    TaskListItem['status'],
    {
      iconClassName: string
      toneClassName: string
      animateClassName?: string
      color?: string
      iconColor?: string
    }
  >
> = {
  error: {
    iconClassName: 'fa-solid fa-triangle-exclamation icon-gradient',
    toneClassName: '',
    iconColor: 'var(--status-error)',
  },
  complete: {
    iconClassName: 'fa-solid fa-circle-check icon-gradient',
    toneClassName: '',
    color: '#50BE37',
    iconColor: '#50BE37',
  },
  waiting: {
    iconClassName: 'fa-solid fa-circle-question icon-gradient',
    toneClassName: '',
    iconColor: 'var(--palette-amber)',
  },
}

const TASK_TITLE_CLASS = 'truncate text-[16px] leading-[20px] font-semibold text-foreground'
const TASK_DESCRIPTION_CLASS = 'mt-[2px] truncate text-sm text-sidebar-item-text'
const TASK_ROW_LAYOUT_CLASS = 'pl-[18px] pr-[18px]'
const TASK_META_CLASS = 'shrink-0 text-[12px] text-sidebar-icon transition-opacity duration-150'
const SECTION_TITLE_CLASS =
  'px-[18px] pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-muted'

function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - Date.parse(isoTimestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

type TimeBucket = 'Now' | 'Today' | 'Yesterday' | 'Last Week' | 'Older'

const TIME_BUCKET_ORDER: TimeBucket[] = ['Now', 'Today', 'Yesterday', 'Last Week', 'Older']

function getTimeBucket(isoTimestamp: string): TimeBucket {
  const now = new Date()
  const date = new Date(isoTimestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) return 'Now'

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= lastWeek) return 'Last Week'
  return 'Older'
}

function groupTasksByTime(tasks: TaskListItem[]): Map<TimeBucket, TaskListItem[]> {
  const groups = new Map<TimeBucket, TaskListItem[]>()
  for (const task of tasks) {
    const bucket = getTimeBucket(task.updatedAt)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket)!.push(task)
  }
  return groups
}

function TaskStatusIcon({ task }: { task: TaskListItem }) {
  const statusIconMeta = TASK_STATUS_ICON_META[task.status]
  const isRunning = RUNNING_STATUSES.includes(task.status)

  if (isRunning) {
    return null
  }

  if (statusIconMeta) {
    return (
      <i
        className={`${statusIconMeta.iconClassName} ${statusIconMeta.toneClassName} ${statusIconMeta.animateClassName ?? ''}`}
        style={
          {
            'fontSize': '13px',
            'color': statusIconMeta.color,
            '--icon-color': statusIconMeta.iconColor,
          } as React.CSSProperties
        }
      />
    )
  }

  return (
    <i
      className="fa-solid fa-circle-check icon-gradient"
      style={{ 'fontSize': '13px', '--icon-color': '#50BE37' } as React.CSSProperties}
    />
  )
}

interface ResolvedFolder {
  canvasId: string | null
  name: string
}

function useResolvedFolderNames(folderPaths: string[] | undefined): ResolvedFolder[] {
  const workspaceSnapshot = useWorkspaceSnapshot()

  return useMemo(() => {
    if (!folderPaths || folderPaths.length === 0) {
      return []
    }

    if (!workspaceSnapshot.root) {
      return folderPaths.map((path) => ({
        canvasId: null,
        name: path.split('/').pop() || path,
      }))
    }

    return folderPaths.map((folderPath) => {
      const fallbackName = folderPath.split('/').pop() || folderPath

      const href = `/workspace/${folderPath}/`
      let canvasId = resolveCanvasPath(workspaceSnapshot.root as CanvasItem, href)
      if (!canvasId) {
        const canvas = findCanvasByPath(workspaceSnapshot.root as CanvasItem, folderPath)
        if (canvas) canvasId = canvas.id
      }

      if (canvasId) {
        const canvas = findCanvasById(workspaceSnapshot.root as CanvasItem, canvasId)
        if (canvas) {
          return { canvasId, name: canvas.name }
        }
      }

      return { canvasId: null, name: fallbackName }
    })
  }, [folderPaths, workspaceSnapshot.root])
}

function TaskRow({
  task,
  activeTaskId,
  onTaskSelect,
  onTaskArchive,
  onTaskHover,
  onCanvasSelect,
}: {
  task: TaskListItem
  activeTaskId: string | null
  onTaskSelect: (task: TaskListItem) => void
  onTaskArchive?: (task: TaskListItem) => void
  onTaskHover?: (task: TaskListItem) => void
  onCanvasSelect?: (canvasId: string) => void
}) {
  const isActive = task.taskId === activeTaskId
  const isRunning = RUNNING_STATUSES.includes(task.status)
  const canArchive = !!onTaskArchive
  const resolvedFolderNames = useResolvedFolderNames(task.modifiedFolders)

  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onTaskSelect(task)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onTaskSelect(task)
          }
        }}
        onPointerEnter={() => onTaskHover?.(task)}
        onFocus={() => onTaskHover?.(task)}
        aria-current={isActive ? 'true' : undefined}
        className={`w-full ${TASK_ROW_LAYOUT_CLASS} py-[6px] bg-transparent text-left transition-colors duration-150 hover:bg-sidebar-selection cursor-pointer`}
      >
        <div className="relative flex flex-col justify-center">
          {isRunning && (
            <img
              src={thinkingAnimation}
              alt=""
              className="absolute w-10 h-10 -left-[14px] top-1/2 -translate-y-1/2 select-none"
            />
          )}
          <div className="flex items-center gap-2">
            <span className="flex w-[13px] shrink-0 items-center justify-center" aria-hidden="true">
              <TaskStatusIcon task={task} />
            </span>
            <p className={`${TASK_TITLE_CLASS} min-w-0 flex-1`}>{task.title || 'New task'}</p>
            <span
              className={`${TASK_META_CLASS} ${canArchive ? 'group-hover:opacity-0 group-focus-within:opacity-0' : ''}`}
            >
              {formatRelativeTime(task.updatedAt)}
            </span>
          </div>
          <p className={`${TASK_DESCRIPTION_CLASS} pl-[21px]`}>{task.description || 'No description'}</p>
          {resolvedFolderNames.length > 0 && (
            <div className="mt-[4px] pl-[21px] flex items-center gap-1.5 min-w-0 overflow-hidden">
              {resolvedFolderNames.map((folder) => (
                <span
                  key={folder.canvasId ?? folder.name}
                  className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-chat-pill text-[11px] font-medium text-foreground-muted min-w-0 shrink-0"
                >
                  <i className="fa-regular fa-folder text-[10px]" aria-hidden="true" />
                  {folder.canvasId && onCanvasSelect ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCanvasSelect(folder.canvasId!)
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                      }}
                      className="truncate hover:text-foreground hover:underline cursor-pointer transition-colors"
                    >
                      {folder.name}
                    </button>
                  ) : (
                    <span className="truncate">{folder.name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {canArchive && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onTaskArchive?.(task)
          }}
          title="Archive task"
          aria-label="Archive task"
          className="absolute right-[8px] top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-150 pointer-events-none scale-90 opacity-0 cursor-pointer group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"
        >
          <i className="fa-solid fa-trash text-[13px] text-foreground-muted transition-colors hover:text-status-error" />
        </button>
      )}
    </div>
  )
}

function SuggestedTaskLoadingRows() {
  return (
    <div className={`${TASK_ROW_LAYOUT_CLASS} py-[6px]`}>
      <div className="relative flex flex-col justify-center">
        <img
          src={thinkingAnimation}
          alt=""
          className="absolute w-10 h-10 -left-[14px] top-1/2 -translate-y-1/2 select-none"
        />
        <div className="flex items-center gap-2">
          <span className="flex w-[13px] shrink-0 items-center justify-center" aria-hidden="true" />
          <p className={`${TASK_TITLE_CLASS} min-w-0 flex-1`}>Generating suggestions...</p>
        </div>
        <p className={`${TASK_DESCRIPTION_CLASS} pl-[21px]`}>Finding a few strong first moves for this workspace.</p>
      </div>
    </div>
  )
}

function OnboardingBanner({ isStarting, onStart }: { isStarting: boolean; onStart?: () => void }) {
  return (
    <div className="px-[18px] py-3">
      <div className="relative rounded-[20px] p-[1.5px] overflow-hidden">
        <div
          className="absolute inset-[-50%] animate-spin"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, #E8A300 25%, #DEDEDE 50%, transparent 75%)',
            animationDuration: '3s',
          }}
        />
        <div className="relative rounded-[18.5px] bg-chat-clear p-4">
          <p className="text-[18px] leading-[22px] font-bold text-foreground">👋 Let's make this workspace yours</p>
          <p className="mt-[10px] text-[14px] leading-[22px] font-medium text-foreground">
            Your context is why Kanwas is a powerful space to think in. Let's have a quick chat so I can get to know
            you.
          </p>
          <button
            type="button"
            disabled={isStarting || !onStart}
            onClick={() => onStart?.()}
            className="mt-[10px] h-[34px] px-4 rounded-2xl border border-[#656565] text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focused-content disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: 'linear-gradient(180deg, #393939 0%, #1D1D1D 100%)' }}
          >
            {isStarting ? 'Starting...' : 'Make it yours'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskLoadingRows() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className={`${TASK_ROW_LAYOUT_CLASS} py-[6px]`}>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <div className="w-[13px] h-[13px] shrink-0 rounded-full animate-skeleton" />
              <div className="h-4 flex-1 rounded-md animate-skeleton" />
              <div className="h-3 w-8 shrink-0 rounded-md animate-skeleton" />
            </div>
            <div className="mt-1 h-4 w-[70%] rounded-md animate-skeleton ml-[21px]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-foreground-muted">Couldn't load tasks.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-chat-pill-border bg-chat-clear shadow-chat-pill px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
      >
        Retry
      </button>
    </div>
  )
}

function EmptyTaskTip({ tip }: { tip: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center">
      <div className="max-w-[300px]">
        <img src={tipImage} alt="tip" className="mx-auto mb-3" width={32} height={21} />
        <p className="text-[14px] font-medium text-foreground/50">{tip}</p>
      </div>
    </div>
  )
}

function TimeGroupHeader({ label, isFirst }: { label: string; isFirst: boolean }) {
  return (
    <div className={`px-4 pb-1.5 ${isFirst ? 'pt-3' : 'pt-3 mt-3 border-t-2 border-[var(--chat-divider)]'}`}>
      <p className="text-[11px] font-semibold tracking-wider uppercase text-foreground-muted">{label}</p>
    </div>
  )
}

export function TaskList({
  tasks,
  suggestedTasks,
  onboardingStatus,
  activeTaskId,
  isLoading,
  isSuggestedTasksLoading,
  isOnboardingStarting = false,
  isError,
  startingSuggestedTaskIds,
  deletingSuggestedTaskIds,
  onTaskSelect,
  onSuggestedTaskStart,
  onSuggestedTaskDelete,
  onOnboardingStart,
  onTaskArchive,
  onTaskHover,
  onCanvasSelect,
  onRetry,
}: TaskListProps) {
  const [randomTip] = useState(() => tips[Math.floor(Math.random() * tips.length)])

  const groupedTasks = useMemo(() => groupTasksByTime(tasks), [tasks])
  const firstBucket = useMemo(
    () =>
      TIME_BUCKET_ORDER.find((bucket) => {
        const bucketTasks = groupedTasks.get(bucket)
        return !!bucketTasks && bucketTasks.length > 0
      }),
    [groupedTasks]
  )

  const baseContainerClass = 'flex-1 min-h-0 overflow-y-auto'
  const visibleSuggestedTasks = useMemo(
    () => suggestedTasks.filter((task) => task.source !== 'onboarding'),
    [suggestedTasks]
  )
  const hasSuggestedTasks = visibleSuggestedTasks.length > 0
  const showOnboardingBanner = onboardingStatus === 'not_started'
  const showSuggestedTaskRows = isSuggestedTasksLoading || hasSuggestedTasks
  const showSuggestedSection = showOnboardingBanner || showSuggestedTaskRows
  const resolvedStartingSuggestedTaskIds = startingSuggestedTaskIds ?? EMPTY_PENDING_IDS
  const resolvedDeletingSuggestedTaskIds = deletingSuggestedTaskIds ?? EMPTY_PENDING_IDS

  const header = (
    <div className="px-4 pt-[18px] pb-2">
      <span className="text-md font-bold text-foreground">Tasks</span>
    </div>
  )

  return (
    <div
      className={`${baseContainerClass} ${!showSuggestedSection && !isLoading && !isError && tasks.length === 0 ? 'flex flex-col' : ''}`}
    >
      {header}

      {showSuggestedSection && (
        <div className="pb-2">
          {showOnboardingBanner && <OnboardingBanner isStarting={isOnboardingStarting} onStart={onOnboardingStart} />}

          {showSuggestedTaskRows && (
            <div className={SECTION_TITLE_CLASS}>
              <p>Suggested tasks</p>
            </div>
          )}

          {isSuggestedTasksLoading && <SuggestedTaskLoadingRows />}

          {visibleSuggestedTasks.map((task) => (
            <SuggestedTaskButtonRow
              key={task.id}
              task={task}
              isStarting={resolvedStartingSuggestedTaskIds.has(task.id)}
              isDeleting={resolvedDeletingSuggestedTaskIds.has(task.id)}
              onStart={onSuggestedTaskStart}
              onDelete={onSuggestedTaskDelete}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <TaskLoadingRows />
      ) : isError ? (
        <TaskErrorState onRetry={onRetry} />
      ) : tasks.length === 0 ? (
        showSuggestedSection ? null : (
          <EmptyTaskTip tip={randomTip} />
        )
      ) : (
        <div className="flex flex-col">
          {TIME_BUCKET_ORDER.map((bucket) => {
            const bucketTasks = groupedTasks.get(bucket)
            if (!bucketTasks || bucketTasks.length === 0) return null

            return (
              <div key={bucket}>
                <TimeGroupHeader label={bucket} isFirst={bucket === firstBucket} />
                {bucketTasks.map((task) => (
                  <TaskRow
                    key={task.taskId}
                    task={task}
                    activeTaskId={activeTaskId}
                    onTaskSelect={onTaskSelect}
                    onTaskArchive={onTaskArchive}
                    onTaskHover={onTaskHover}
                    onCanvasSelect={onCanvasSelect}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
