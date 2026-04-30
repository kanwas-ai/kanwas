import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConversationItem, UserMessageItem } from 'backend/agent'
import { useChat } from '@/providers/chat'
import { useAuthState } from '@/providers/auth'
import { useWorkspace, useWorkspaceSnapshot } from '@/providers/workspace'
import { resolveCanvasPath, findCanvasByPath, findCanvasById } from '@/lib/workspaceUtils'
import type { CanvasItem } from 'shared'
import { useSnapshot } from 'valtio'
import type { DeepReadonly } from 'ts-essentials'
import { useSendMessage, useOpenTask, useAnswerQuestion, usePrefetchTaskInvocation } from '@/providers/chat/hooks'
import { MarvinMenu } from '@/components/ui/MarvinMenu'
import { useTasks } from '@/hooks/useTasks'
import { useWorkspaceSuggestedTasks } from '@/hooks/useWorkspaceSuggestedTasks'
import { useStartWorkspaceOnboarding } from '@/hooks/useWorkspaces'
import { workspaceSuggestedTasksQueryKey, type WorkspaceSuggestedTask } from '@/api/suggestedTasks'
import { taskListQueryKey, type TaskListItem } from '@/api/tasks'
import type { WorkspaceOnboardingStatus } from '@/api/workspaces'
import thinkingAnimation from '@/assets/thinking-animation.png'
import { showToast } from '@/utils/toast'

import { UserMessage } from './UserMessage'
import { WorkingContext } from './WorkingContext'
import { Thinking } from './Thinking'
import { Progress } from './Progress'
import { WebSearch } from './WebSearch'
import { ComposioSearch } from './ComposioSearch'
import { ComposioTool } from './ComposioTool'
import { ComposioWorkbench } from './ComposioWorkbench'
import { ComposioBash } from './ComposioBash'
import { ComposioSchema } from './ComposioSchema'
import { BashTool } from './BashTool'
import { TextEditorTool } from './TextEditorTool'
import { CanvasRepositionTool } from './CanvasRepositionTool'
import { WebFetchTool } from './WebFetchTool'
import { SubagentExecution } from './SubagentExecution'
import { ReportOutput } from './ReportOutput'
import { ChatMessage } from './ChatMessage'
import { Error } from './events/Error'
import { ChatInput } from './ChatInput'
import { ChatSelectionSave } from './ChatSelectionSave'
import { ThinkingLoader } from './ThinkingLoader'
import { TaskList } from './TaskList'
import { SuggestedTasksTimelineItem } from './SuggestedTasksTimelineItem'
import { ResizeHandle } from '@/components/ui/ResizeHandle/ResizeHandle'
import { useResize } from '@/components/ui/ResizeHandle/useResize'
import { AskQuestion } from './AskQuestion'
import { SkillActivatedEvent, SkillCreatedEvent } from '@/components/skills'
import { ConnectToolsTip } from './ContextualTip'
import { dismissTip, useActiveTips } from '@/store/useTipStore'
import { useAutoScroll } from './useAutoScroll'
import { useUI, useConnectionsModal } from '@/store/useUIStore'
import { DEFAULT_USER_LLM_HEADER_LABEL, getUserConfig, getUserLlmHeaderLabel } from '@/api/userConfig'
import {
  isStreamingTimelineItem,
  mergeTimelineWithStreaming,
  type TimelineWithStreamingItem,
} from './streamingTimeline'
import {
  createInlineSuggestedTaskStartRequest,
  createPersistedSuggestedTaskStartRequest,
  shouldRefreshWorkspaceSuggestedTasks,
  type SuggestedTaskStartRequest,
} from './suggestedTasks'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getLayoutMetric(value: unknown, depth = 0): string {
  if (value == null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return `s:${value.length}`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `a:${value.length}`
    }

    return `a:${value.length}[${value
      .slice(0, 5)
      .map((item) => getLayoutMetric(item, depth + 1))
      .join(',')}]`
  }

  if (!isRecord(value)) {
    return typeof value
  }

  const entries = Object.entries(value)
    .filter(([key]) => key !== 'id' && key !== 'timestamp' && key !== 'lastUpdated')
    .sort(([left], [right]) => left.localeCompare(right))

  if (depth >= 2) {
    return `o:${entries.length}`
  }

  return `o:${entries.length}{${entries
    .slice(0, 8)
    .map(([key, nestedValue]) => `${key}:${getLayoutMetric(nestedValue, depth + 1)}`)
    .join(',')}}`
}

function getRenderedTailDescriptor(item: TimelineWithStreamingItem | null, showInlineThinkingLoader: boolean) {
  if (showInlineThinkingLoader) {
    return {
      identityKey: 'loader:thinking',
      layoutKey: 'loader:thinking',
    }
  }

  if (!item) {
    return {
      identityKey: 'empty',
      layoutKey: 'empty',
    }
  }

  return {
    identityKey: `item:${item.id}:${item.type}`,
    layoutKey: `item:${item.id}:${item.type}:${getLayoutMetric(item)}`,
  }
}

interface EditingMessageState {
  itemId: string
  invocationId: string
  message: string
  mentions?: UserMessageItem['mentions']
}

interface EditSession {
  id: string
  label: string
  message: string
  mentions?: UserMessageItem['mentions']
}

interface ChatProps {
  workspaceId: string
  onboardingStatus?: WorkspaceOnboardingStatus
  onNodeSelect?: (nodeId: string, canvasId: string) => void
  onCanvasSelect?: (canvasId: string) => void
  onWorkspaceLinkNavigate?: (href: string) => boolean
  selectedNodeIds: string[]
  onDeselectNode?: (nodeId: string) => void
}

export function Chat({
  workspaceId,
  onboardingStatus,
  onNodeSelect,
  onCanvasSelect,
  onWorkspaceLinkNavigate,
  selectedNodeIds,
  onDeselectNode,
}: ChatProps) {
  const { state, derived } = useChat()
  const authState = useAuthState()
  const { activeCanvasId, setActiveCanvasId } = useWorkspace()
  const workspaceSnapshot = useWorkspaceSnapshot()
  const { chatWidth, setChatWidth } = useUI()
  const handleCanvasSelect = onCanvasSelect ?? setActiveCanvasId

  const sendMessage = useSendMessage()
  const openTask = useOpenTask()
  const prefetchTaskInvocation = usePrefetchTaskInvocation()
  const answerQuestion = useAnswerQuestion()
  const queryClient = useQueryClient()
  const startWorkspaceOnboarding = useStartWorkspaceOnboarding(workspaceId)
  const {
    data: tasksData,
    isLoading: isTasksLoading,
    isError: isTasksError,
    refetch: refetchTasks,
    archiveTask,
  } = useTasks(workspaceId)
  const {
    data: suggestedTasksData,
    refetch: refetchSuggestedTasks,
    deleteSuggestedTask,
  } = useWorkspaceSuggestedTasks(workspaceId)
  const { data: userConfigData } = useQuery({
    queryKey: ['user-config'],
    queryFn: getUserConfig,
    enabled: authState.isAuthenticated && !authState.isLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const snapshot = useSnapshot(state)
  const isTasksView = (snapshot.panelView ?? 'tasks') === 'tasks'
  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData?.tasks])
  const suggestedTasks = useMemo(() => suggestedTasksData?.tasks ?? [], [suggestedTasksData?.tasks])
  const isSuggestedTasksLoading = suggestedTasksData?.isLoading ?? false
  const userLlmHeaderLabel = userConfigData?.config
    ? getUserLlmHeaderLabel(userConfigData.config)
    : DEFAULT_USER_LLM_HEADER_LABEL
  const streamingItemCount = Object.keys(snapshot.streamingItems).length
  const hasStreamingItems = streamingItemCount > 0
  // Track latest streaming update so auto-scroll fires as content grows
  const streamingVersion = Object.values(snapshot.streamingItems).reduce(
    (max, item) => Math.max(max, item.lastUpdated),
    0
  )

  // Get derived values from context (computed in ChatProvider)
  const { isProcessing, hasPendingQuestion } = derived
  const showCenteredInvocationLoader = snapshot.isHydratingTask && snapshot.timeline.length === 0 && !hasStreamingItems
  const showInlineThinkingLoader = isProcessing && !hasStreamingItems

  // Contextual tips from timeline
  const {
    connectTools: connectToolsTip,
    voiceInput: showVoiceTip,
    directModeAvailable: showDirectModeTip,
  } = useActiveTips(
    snapshot.timeline as ReadonlyArray<{ type: string; tipId?: string; connector?: string; label?: string }>
  )
  const { connectionsModalOpen, openedFromTip, clearOpenedFromTip } = useConnectionsModal()
  const prevModalOpenRef = useRef(false)
  useEffect(() => {
    // Dismiss tip only when modal was opened via the tip, not from sidebar
    if (prevModalOpenRef.current && !connectionsModalOpen) {
      if (openedFromTip && connectToolsTip) {
        dismissTip('connect_tools')
      }
      clearOpenedFromTip()
    }
    prevModalOpenRef.current = connectionsModalOpen
  }, [connectionsModalOpen, openedFromTip, connectToolsTip, clearOpenedFromTip])

  const [pendingQuestionAnswers, setPendingQuestionAnswers] = useState<Set<string>>(new Set())
  const [startingSuggestedTaskIds, setStartingSuggestedTaskIds] = useState<Set<string>>(new Set())
  const [deletingSuggestedTaskIds, setDeletingSuggestedTaskIds] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<File[]>([])
  const [editingMessage, setEditingMessage] = useState<EditingMessageState | null>(null)
  const refreshedSuggestedTasksItemIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    refreshedSuggestedTasksItemIdsRef.current.clear()
    setEditingMessage(null)
  }, [workspaceId])

  useEffect(() => {
    const refreshableItemIds = snapshot.timeline
      .filter(shouldRefreshWorkspaceSuggestedTasks)
      .map((item) => item.id)
      .filter((itemId) => !refreshedSuggestedTasksItemIdsRef.current.has(itemId))

    if (refreshableItemIds.length === 0) {
      return
    }

    for (const itemId of refreshableItemIds) {
      refreshedSuggestedTasksItemIdsRef.current.add(itemId)
    }

    void queryClient.invalidateQueries({
      queryKey: workspaceSuggestedTasksQueryKey(workspaceId),
      refetchType: 'active',
    })
  }, [queryClient, snapshot.timeline, workspaceId])

  useEffect(() => {
    if (!editingMessage) {
      return
    }

    if (isTasksView || !snapshot.timeline.some((item) => item.id === editingMessage.itemId)) {
      setEditingMessage(null)
    }
  }, [editingMessage, isTasksView, snapshot.timeline])

  // Memoized timeline with synthetic streaming items from the streamingItems object
  const timelineWithStreaming = useMemo(() => {
    return mergeTimelineWithStreaming(snapshot.timeline, snapshot.streamingItems)
  }, [snapshot.timeline, snapshot.streamingItems])

  const lastRenderedTimelineItem =
    timelineWithStreaming.length > 0 ? timelineWithStreaming[timelineWithStreaming.length - 1] : null
  const renderedTail = useMemo(
    () => getRenderedTailDescriptor(lastRenderedTimelineItem, showInlineThinkingLoader),
    [lastRenderedTimelineItem, showInlineThinkingLoader]
  )
  const renderedItemCount = timelineWithStreaming.length + (showInlineThinkingLoader ? 1 : 0)

  const { scrollContainerRef, scrollContentRef, scrollEndRef, showScrollButton, scrollToBottom, handleScroll } =
    useAutoScroll({
      enabled: !isTasksView && !showCenteredInvocationLoader,
      newContentDependencies: [renderedItemCount, renderedTail.identityKey],
      updatedContentDependencies: [streamingVersion, renderedTail.layoutKey],
    })

  // Marvin Mode - triple-click Easter egg
  const [marvinMenuOpen, setMarvinMenuOpen] = useState(false)
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleMarvinAccessClick = () => {
    clickCountRef.current += 1
    clearTimeout(clickTimerRef.current)

    if (clickCountRef.current >= 3) {
      setMarvinMenuOpen(true)
      clickCountRef.current = 0
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
      }, 500)
    }
  }

  const { isResizing, resizeRef, handleMouseDown, handleDoubleClick } = useResize({
    direction: 'horizontal',
    position: 'right',
    minSize: 300,
    maxSize: (windowWidth) => windowWidth * 0.7,
    onResize: setChatWidth,
    doubleClickToggleRatio: 0.4,
    defaultSize: 503,
    currentSize: chatWidth,
  })

  const handleMessageSubmit = (
    message: string,
    uploadedFiles: File[],
    mentions: Array<{ id: string; label: string }>,
    textSelection: { nodeId: string; nodeName: string; text: string; lineCount: number } | null
  ) => {
    scrollToBottom('smooth')

    const currentEdit = editingMessage
    const invocationId = isTasksView || currentEdit ? null : state.invocationId
    const mentionedNodeIds = mentions.map((m) => m.id)

    if (currentEdit) {
      setEditingMessage(null)
    }

    void sendMessage(
      message,
      activeCanvasId,
      invocationId,
      selectedNodeIds.length > 0 ? [...selectedNodeIds] : null,
      uploadedFiles,
      mentionedNodeIds.length > 0 ? mentionedNodeIds : null,
      mentions,
      textSelection,
      currentEdit
        ? {
            edit: {
              editedInvocationId: currentEdit.invocationId,
              editedTimelineItemId: currentEdit.itemId,
            },
          }
        : undefined
    )
    setFiles([])
  }

  const handleEditMessage = useCallback(
    (item: DeepReadonly<UserMessageItem>) => {
      if (!item.invocationId) {
        return
      }

      setFiles([])
      setEditingMessage({
        itemId: item.id,
        invocationId: item.invocationId,
        message: item.message,
        mentions: item.mentions?.map((mention) => ({ id: mention.id, label: mention.label })),
      })
      scrollToBottom('smooth')
    },
    [scrollToBottom]
  )

  const stopChatEventPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation()
  }, [])

  const handleAnswerQuestion = async (itemId: string, answers: Record<string, string[]>) => {
    if (!answerQuestion) return

    // Set pending state first to prevent double-clicks
    setPendingQuestionAnswers((prev) => {
      const next = new Set(prev)
      next.add(itemId)
      return next
    })

    try {
      await answerQuestion(itemId, answers)
    } finally {
      setPendingQuestionAnswers((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleGoBack = () => {
    state.panelView = 'tasks'
    setEditingMessage(null)
    void refetchTasks()
    void refetchSuggestedTasks()
  }

  const handleTaskSelect = useCallback(
    (task: TaskListItem) => {
      setFiles([])
      setEditingMessage(null)
      void openTask(task)
    },
    [openTask]
  )

  const handleTaskArchive = useCallback(
    (task: TaskListItem) => {
      void archiveTask(task)
    },
    [archiveTask]
  )

  // Get active task for header display
  const activeTask = useMemo(() => {
    if (!snapshot.activeTaskId) return null
    return tasks.find((t) => t.taskId === snapshot.activeTaskId) ?? null
  }, [tasks, snapshot.activeTaskId])

  // Extract folder paths from live timeline (real-time updates)
  const liveModifiedFolders = useMemo(() => {
    const folders = new Set<string>()
    for (const item of timelineWithStreaming) {
      if (item.type === 'text_editor') {
        const textEditorItem = item as { status?: string; command?: string; path?: string }
        // Include both completed and in-progress modifications (not views)
        if (textEditorItem.command !== 'view' && textEditorItem.path) {
          // Extract parent folder from path (remove /workspace/ prefix)
          const normalized = textEditorItem.path.replace(/^\/workspace\//, '')
          const parts = normalized.split('/')
          if (parts.length > 1) {
            folders.add(parts.slice(0, -1).join('/'))
          }
        }
      }
    }
    return Array.from(folders).sort()
  }, [timelineWithStreaming])

  // Combine live timeline folders with task's stored folders (for completed tasks)
  const allModifiedFolders = useMemo(() => {
    const combined = new Set([...liveModifiedFolders, ...(activeTask?.modifiedFolders ?? [])])
    return Array.from(combined).sort()
  }, [liveModifiedFolders, activeTask?.modifiedFolders])

  // Resolve folder paths to canvas IDs and current names
  const modifiedCanvases = useMemo(() => {
    if (!workspaceSnapshot.root || allModifiedFolders.length === 0) return []

    return allModifiedFolders.map((folderPath) => {
      // Extract just the folder name (last segment) for fallback display
      const fallbackName = folderPath.split('/').pop() || folderPath

      // Try path resolution first
      const href = `/workspace/${folderPath}/`
      let canvasId = resolveCanvasPath(workspaceSnapshot.root as CanvasItem, href)
      // Fallback: find by traversing tree
      if (!canvasId) {
        const canvas = findCanvasByPath(workspaceSnapshot.root as CanvasItem, folderPath)
        if (canvas) canvasId = canvas.id
      }

      // Look up current name if canvas ID found
      if (canvasId) {
        const canvas = findCanvasById(workspaceSnapshot.root as CanvasItem, canvasId)
        if (canvas) return { id: canvasId, name: canvas.name }
      }

      // Use fallback name if resolution failed
      return { id: null as string | null, name: fallbackName }
    })
  }, [allModifiedFolders, workspaceSnapshot.root])

  const handleSuggestedTaskStart = useCallback(
    async ({ task: suggestedTask, deleteSuggestionId }: SuggestedTaskStartRequest) => {
      setFiles([])
      setEditingMessage(null)
      setStartingSuggestedTaskIds((prev) => {
        const next = new Set(prev)
        next.add(suggestedTask.id)
        return next
      })

      try {
        const result = await sendMessage(
          suggestedTask.prompt,
          activeCanvasId,
          null,
          null,
          undefined,
          null,
          undefined,
          null,
          suggestedTask.source ? { source: suggestedTask.source } : undefined
        )

        if (!result.ok) {
          return
        }

        if (!deleteSuggestionId) {
          return
        }

        try {
          await deleteSuggestedTask(deleteSuggestionId)
        } catch (error) {
          console.error('Failed to remove suggested task after starting it:', error)
          showToast('Task started, but the suggestion could not be removed. Refreshing suggestions.', 'info')
          await refetchSuggestedTasks()
        }
      } finally {
        setStartingSuggestedTaskIds((prev) => {
          const next = new Set(prev)
          next.delete(suggestedTask.id)
          return next
        })
      }
    },
    [activeCanvasId, deleteSuggestedTask, refetchSuggestedTasks, sendMessage]
  )

  const handlePersistedSuggestedTaskStart = useCallback(
    (suggestedTask: WorkspaceSuggestedTask) => {
      void handleSuggestedTaskStart(createPersistedSuggestedTaskStartRequest(suggestedTask))
    },
    [handleSuggestedTaskStart]
  )

  const handleOnboardingStart = useCallback(async () => {
    setFiles([])
    setEditingMessage(null)

    try {
      const result = await startWorkspaceOnboarding.mutateAsync()

      state.timeline = []
      state.streamingItems = {}
      state.activeTaskId = result.taskId
      state.invocationId = result.invocationId
      state.panelView = 'chat'
      state.isHydratingTask = false

      void queryClient.invalidateQueries({
        queryKey: taskListQueryKey(workspaceId),
        refetchType: 'active',
      })

      if (result.blocked?.reason) {
        showToast(result.blocked.reason, 'error')
      }
    } catch {
      // useStartWorkspaceOnboarding owns the user-facing error toast.
    }
  }, [queryClient, startWorkspaceOnboarding, state, workspaceId])

  const handleSuggestedTaskDelete = useCallback(
    async (suggestedTask: WorkspaceSuggestedTask) => {
      setDeletingSuggestedTaskIds((prev) => {
        const next = new Set(prev)
        next.add(suggestedTask.id)
        return next
      })

      try {
        await deleteSuggestedTask(suggestedTask.id)
      } catch (error) {
        console.error('Failed to delete suggested task:', error)
        showToast('Failed to remove suggestion. Please try again.', 'error')
        await refetchSuggestedTasks()
      } finally {
        setDeletingSuggestedTaskIds((prev) => {
          const next = new Set(prev)
          next.delete(suggestedTask.id)
          return next
        })
      }
    },
    [deleteSuggestedTask, refetchSuggestedTasks]
  )

  // First user prompt for snippet source attribution
  const chatSource = useMemo(() => {
    const first = snapshot.timeline.find((i) => i.type === 'user_message')
    if (!first || !('message' in first)) return 'Chat'
    const msg = (first as { message: string }).message
    return msg.length > 40 ? `Chat: "${msg.slice(0, 40)}..."` : `Chat: "${msg}"`
  }, [snapshot.timeline])

  const editSession = useMemo<EditSession | null>(
    () =>
      editingMessage
        ? {
            id: `${editingMessage.itemId}:${editingMessage.invocationId}`,
            label: editingMessage.message,
            message: editingMessage.message,
            mentions: editingMessage.mentions,
          }
        : null,
    [editingMessage]
  )

  return (
    <aside
      className="chat-sidebar bg-chat-background border-r border-[var(--chat-sidebar-border)] relative flex h-full min-h-0 flex-col"
      style={{ width: `${chatWidth}px` }}
      onClick={stopChatEventPropagation}
      onMouseDown={stopChatEventPropagation}
    >
      {/* Resize Handle */}
      <ResizeHandle
        direction="horizontal"
        position="right"
        isResizing={isResizing}
        resizeRef={resizeRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />

      {/* Header */}
      {!isTasksView && (
        <div className="shrink-0 sticky top-0 z-10 pt-[18px] pb-2 pl-4 pr-5 relative after:absolute after:left-0 after:right-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-chat-background after:to-transparent after:pointer-events-none">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="text-foreground hover:text-foreground-muted inline-flex items-center gap-1.5 text-md font-bold cursor-pointer select-none transition-colors min-w-0"
            >
              <i className="fa-solid fa-chevron-left text-[8px] leading-none shrink-0" aria-hidden="true" />
              <span className="truncate">{activeTask?.title || 'Tasks'}</span>
            </button>
            <button
              type="button"
              onClick={handleMarvinAccessClick}
              className="max-w-[7rem] shrink-0 cursor-pointer select-none truncate text-right text-sm font-medium text-foreground-muted"
              title={userLlmHeaderLabel}
            >
              {userLlmHeaderLabel}
            </button>
          </div>
          {modifiedCanvases.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-sidebar-icon mt-1 pl-[14px] min-w-0">
              {modifiedCanvases.map((canvas) => (
                <span key={canvas.id ?? canvas.name} className="flex items-center gap-1 min-w-0 shrink-0">
                  <i className="fa-regular fa-folder text-[10px]" aria-hidden="true" />
                  {canvas.id ? (
                    <button
                      type="button"
                      onClick={() => handleCanvasSelect(canvas.id!)}
                      className="truncate hover:text-foreground-muted hover:underline cursor-pointer transition-colors"
                    >
                      {canvas.name}
                    </button>
                  ) : (
                    <span className="truncate">{canvas.name}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Marvin Mode Menu */}
      <MarvinMenu
        isOpen={marvinMenuOpen}
        onClose={() => setMarvinMenuOpen(false)}
        timeline={snapshot.timeline as ConversationItem[]}
      />

      {isTasksView ? (
        <>
          <TaskList
            tasks={tasks}
            suggestedTasks={suggestedTasks}
            onboardingStatus={onboardingStatus}
            activeTaskId={snapshot.activeTaskId}
            isLoading={isTasksLoading}
            isSuggestedTasksLoading={isSuggestedTasksLoading}
            isOnboardingStarting={startWorkspaceOnboarding.isPending}
            isError={isTasksError}
            startingSuggestedTaskIds={startingSuggestedTaskIds}
            deletingSuggestedTaskIds={deletingSuggestedTaskIds}
            onTaskSelect={handleTaskSelect}
            onTaskArchive={handleTaskArchive}
            onTaskHover={prefetchTaskInvocation}
            onCanvasSelect={handleCanvasSelect}
            onSuggestedTaskStart={handlePersistedSuggestedTaskStart}
            onSuggestedTaskDelete={handleSuggestedTaskDelete}
            onOnboardingStart={handleOnboardingStart}
            onRetry={() => {
              void refetchTasks()
            }}
          />

          <ChatInput
            workspaceId={workspaceId}
            onSubmit={handleMessageSubmit}
            isProcessing={false}
            hasPendingQuestion={false}
            files={files}
            onFilesChange={setFiles}
            selectedNodeIds={selectedNodeIds}
            onDeselectNode={onDeselectNode}
            editSession={editSession}
            onCancelEdit={() => setEditingMessage(null)}
          />
        </>
      ) : (
        <>
          {/* Messages wrapper with scroll button */}
          <div className="flex-1 min-h-0 relative">
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto pt-4 pb-6 px-4"
              style={{ overflowAnchor: 'none' }}
            >
              <ChatSelectionSave source={chatSource}>
                <div ref={scrollContentRef}>
                  {showCenteredInvocationLoader ? (
                    <div className="flex min-h-full items-center justify-center py-12">
                      <div role="status" aria-live="polite" className="flex select-none flex-col items-center gap-2">
                        <img src={thinkingAnimation} alt="" aria-hidden="true" className="h-14 w-14" />
                        <span className="text-sm font-medium text-foreground-muted">Loading task...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-[10px]">
                      {/* Render timeline */}
                      {timelineWithStreaming.map((item) => {
                        const renderItem = () => {
                          switch (item.type) {
                            case 'user_message':
                              return (
                                <UserMessage
                                  item={item}
                                  canEdit={!!item.invocationId && !isProcessing && !snapshot.isHydratingTask}
                                  isEditing={editingMessage?.itemId === item.id}
                                  onEdit={handleEditMessage}
                                />
                              )

                            case 'working_context':
                              return <WorkingContext item={item} onCanvasSelect={handleCanvasSelect} />

                            case 'web_search':
                              return <WebSearch item={item} streaming={isStreamingTimelineItem(item)} />

                            case 'composio_search':
                              return <ComposioSearch item={item} />

                            case 'composio_tool':
                              return <ComposioTool item={item} />

                            case 'composio_workbench':
                              return <ComposioWorkbench item={item} />

                            case 'composio_bash':
                              return <ComposioBash item={item} />

                            case 'composio_schema':
                              return <ComposioSchema item={item} />

                            case 'thinking': {
                              const streamingData = snapshot.streamingItems[item.id]
                              const isStreaming = isStreamingTimelineItem(item)
                              return (
                                <Thinking item={item} streamingText={isStreaming ? streamingData?.text : undefined} />
                              )
                            }

                            case 'progress': {
                              const streamingData = snapshot.streamingItems[item.id]
                              const isStreaming = isStreamingTimelineItem(item)
                              return (
                                <Progress
                                  item={item}
                                  streaming={isStreaming}
                                  streamingMessage={isStreaming ? streamingData?.text : undefined}
                                />
                              )
                            }

                            case 'chat':
                              return (
                                <ChatMessage
                                  item={item}
                                  streaming={isStreamingTimelineItem(item)}
                                  onWorkspaceLinkNavigate={onWorkspaceLinkNavigate}
                                />
                              )

                            case 'execution_completed':
                              return null

                            case 'error':
                              return <Error item={item} />

                            case 'bash':
                              return <BashTool item={item} />

                            case 'text_editor':
                              return (
                                <TextEditorTool
                                  item={item}
                                  onNodeSelect={onNodeSelect}
                                  streaming={isStreamingTimelineItem(item)}
                                />
                              )

                            case 'reposition_files':
                              return (
                                <CanvasRepositionTool
                                  item={item}
                                  onNodeSelect={onNodeSelect}
                                  streaming={isStreamingTimelineItem(item)}
                                />
                              )

                            case 'web_fetch':
                              return <WebFetchTool item={item} />

                            case 'subagent_execution':
                              return <SubagentExecution item={item} />

                            case 'skill_activated':
                              return <SkillActivatedEvent item={item} />

                            case 'skill_created':
                              return <SkillCreatedEvent item={item} />

                            case 'contextual_tip':
                              // Tips render in specific UI locations (above input, mic overlay), not inline
                              return null

                            case 'report_output':
                              return <ReportOutput item={item} streaming={isStreamingTimelineItem(item)} />

                            case 'ask_question': {
                              const isStreaming = isStreamingTimelineItem(item)
                              const streamingData = snapshot.streamingItems[item.id]

                              return (
                                <AskQuestion
                                  item={item}
                                  isPending={pendingQuestionAnswers.has(item.id)}
                                  onAnswer={handleAnswerQuestion}
                                  streaming={isStreaming}
                                  streamingPhase={isStreaming ? streamingData?.phase : undefined}
                                />
                              )
                            }

                            case 'suggested_tasks': {
                              const suggestedTasksItem = {
                                ...item,
                                tasks: item.tasks.map((task) => ({ ...task })),
                              }

                              return (
                                <SuggestedTasksTimelineItem
                                  item={suggestedTasksItem}
                                  startingSuggestedTaskIds={startingSuggestedTaskIds}
                                  deletingSuggestedTaskIds={deletingSuggestedTaskIds}
                                  onSuggestedTaskStart={(task) => {
                                    void handleSuggestedTaskStart(
                                      createInlineSuggestedTaskStartRequest(suggestedTasksItem, task)
                                    )
                                  }}
                                />
                              )
                            }

                            default:
                              return null
                          }
                        }

                        const content = renderItem()
                        if (!content) return null

                        const alignment = item.type === 'user_message' ? 'justify-end' : 'justify-start'

                        return (
                          <div key={item.id} className={`group relative flex min-w-0 ${alignment}`}>
                            <div className="w-full min-w-0">{content}</div>
                          </div>
                        )
                      })}

                      {/* Show ThinkingLoader only when processing AND no active streaming items */}
                      {showInlineThinkingLoader && (
                        <div className="group relative flex justify-start">
                          <div className="w-full min-w-0 pr-4">
                            <ThinkingLoader />
                          </div>
                        </div>
                      )}

                      <div ref={scrollEndRef} />
                    </div>
                  )}
                </div>
              </ChatSelectionSave>
            </div>

            {/* Scroll to bottom button */}
            {showScrollButton && (
              <button
                onClick={() => scrollToBottom()}
                className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 w-[36px] h-[36px] flex items-center justify-center rounded-full border border-chat-pill-border text-foreground-muted hover:text-foreground transition-colors cursor-pointer bg-chat-clear shadow-chat-pill"
                title="Scroll to bottom"
              >
                <i className="fa-solid fa-arrow-down text-[12px]" />
              </button>
            )}
          </div>

          {/* Contextual tip: connect tools */}
          {connectToolsTip && (
            <ConnectToolsTip
              connector={connectToolsTip.connector}
              label={connectToolsTip.label}
              onDismiss={() => dismissTip('connect_tools')}
            />
          )}

          {/* Input */}
          <div className="shrink-0">
            <ChatInput
              workspaceId={workspaceId}
              onSubmit={handleMessageSubmit}
              isProcessing={isProcessing}
              hasPendingQuestion={hasPendingQuestion}
              files={files}
              onFilesChange={setFiles}
              selectedNodeIds={selectedNodeIds}
              onDeselectNode={onDeselectNode}
              showVoiceTip={showVoiceTip}
              onDismissVoiceTip={() => dismissTip('voice_input')}
              showDirectModeTip={showDirectModeTip}
              onDismissDirectModeTip={() => dismissTip('direct_mode_available')}
              editSession={editSession}
              onCancelEdit={() => setEditingMessage(null)}
            />
          </div>
        </>
      )}
    </aside>
  )
}
