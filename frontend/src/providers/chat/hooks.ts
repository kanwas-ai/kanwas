import { useChat } from '@/providers/chat'
import { useCallback, useRef } from 'react'
import type { AgentMode } from 'backend/agent'
import { useWorkspace } from '@/providers/workspace'
import { useQueryClient } from '@tanstack/react-query'
import {
  getInvocationTimeline,
  getInvocationState,
  answerInvocationQuestion,
  invocationStateQueryKey,
  taskListQueryKey,
  upsertTaskListResponse,
  type InvocationStateResponse,
  type TaskListItem,
  type TaskListResponse,
} from '@/api/tasks'
import { formatWorkspaceInvokeContext } from 'shared'
import { showToast } from '@/utils/toast'

type TextSelectionPayload = { nodeId: string; nodeName: string; text: string; lineCount: number } | null | undefined

const INVOCATION_STATE_STALE_TIME_MS = 30_000

type InvocationStateSnapshot = NonNullable<InvocationStateResponse['state']>

export type SendMessageResult =
  | {
      ok: true
      invocationId: string
      taskId: string
    }
  | {
      ok: false
      error: unknown
    }

interface SendMessageOptions {
  source?: string
  edit?: {
    editedInvocationId: string
    editedTimelineItemId: string
  }
}

function getInvocationStateQueryOptions(invocationId: string) {
  return {
    queryKey: invocationStateQueryKey(invocationId),
    queryFn: () => getInvocationState(invocationId),
    staleTime: INVOCATION_STATE_STALE_TIME_MS,
  }
}

function extractInvokeStateSnapshot(payload: unknown): InvocationStateSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const stateEnvelope = (payload as { state?: unknown }).state
  if (!stateEnvelope || typeof stateEnvelope !== 'object') {
    return null
  }

  const serializedState = (stateEnvelope as { state?: unknown }).state
  if (!serializedState || typeof serializedState !== 'object') {
    return null
  }

  return {
    state: serializedState as InvocationStateSnapshot['state'],
  }
}

function extractInvokeTimeline(payload: unknown, invocationId: string) {
  const stateSnapshot = extractInvokeStateSnapshot(payload)
  if (!stateSnapshot) {
    return null
  }

  const invocationState: InvocationStateResponse = {
    invocationId,
    state: stateSnapshot,
  }

  return getInvocationTimeline(invocationState)
}

function isBlockedInvokePayload(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && 'blocked' in payload)
}

interface BuildInvokePayloadArgs {
  message: string
  canvasId: string | null
  invocationId: string | null
  editedInvocationId?: string | null
  selectedNodeIds?: string[] | null
  files?: File[]
  mentionedNodeIds?: string[] | null
  textSelection?: TextSelectionPayload
  store: ReturnType<typeof useWorkspace>['store']
  yoloMode: boolean
  agentMode: AgentMode
  source?: string
}

async function buildInvokePayload({
  message,
  canvasId,
  invocationId,
  editedInvocationId,
  selectedNodeIds,
  files,
  mentionedNodeIds,
  textSelection,
  store,
  yoloMode,
  agentMode,
  source,
}: BuildInvokePayloadArgs) {
  const effectiveSelectedIds =
    !textSelection && selectedNodeIds && selectedNodeIds.length > 0
      ? selectedNodeIds.filter((id) => !mentionedNodeIds?.includes(id))
      : undefined

  const workspaceContext = store.root
    ? formatWorkspaceInvokeContext(store, {
        canvasId,
        selectedNodeIds: effectiveSelectedIds,
        mentionedNodeIds,
      })
    : undefined

  return {
    query: message,
    ...(editedInvocationId ? { edited_invocation_id: editedInvocationId } : { invocation_id: invocationId }),
    canvas_id: canvasId || null,
    files: files && files.length > 0 ? (files as never) : undefined,
    mode: agentMode,
    yolo_mode: yoloMode,
    selected_text: textSelection
      ? { node_id: textSelection.nodeId, node_name: textSelection.nodeName, text: textSelection.text }
      : undefined,
    workspace_tree: workspaceContext?.workspaceTree,
    canvas_path: workspaceContext?.canvasPath ?? undefined,
    active_canvas_context: workspaceContext?.activeCanvasContext ?? undefined,
    selected_node_paths: workspaceContext?.selectedNodePaths,
    mentioned_node_paths: workspaceContext?.mentionedNodePaths,
    ...(source ? { source } : {}),
  }
}

export const useSendMessage = () => {
  const { state } = useChat()
  const { workspaceId, store } = useWorkspace()
  const queryClient = useQueryClient()

  return useCallback(
    async (
      message: string,
      canvasId: string | null,
      invocationId: string | null,
      selectedNodeIds?: string[] | null,
      files?: File[],
      mentionedNodeIds?: string[] | null,
      mentions?: Array<{ id: string; label: string }>,
      textSelection?: { nodeId: string; nodeName: string; text: string; lineCount: number } | null,
      options?: SendMessageOptions
    ) => {
      const trimmedMessage = message.trim()
      if (!trimmedMessage) {
        return {
          ok: false as const,
          error: new Error('Message cannot be empty'),
        }
      }

      const editContext = options?.edit
      const editedInvocationId = editContext?.editedInvocationId ?? null
      const isEditing = !!editContext

      const previousState = {
        timeline: [...state.timeline],
        streamingItems: { ...state.streamingItems },
        activeTaskId: state.activeTaskId,
        invocationId: state.invocationId,
        isHydratingTask: state.isHydratingTask,
        panelView: state.panelView,
      }

      if (!invocationId && !isEditing) {
        state.timeline = []
        state.streamingItems = {}
        state.activeTaskId = null
      }

      if (isEditing) {
        const editIndex = state.timeline.findIndex((item) => item.id === editContext.editedTimelineItemId)
        if (editIndex >= 0) {
          state.timeline = state.timeline.slice(0, editIndex)
        }
        state.streamingItems = {}
      }

      state.isHydratingTask = false

      state.panelView = 'chat'

      // Optimistic update: add user message to timeline immediately
      state.timeline.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        type: 'user_message',
        message: trimmedMessage,
        timestamp: Date.now(),
        uploadedFiles:
          files && files.length > 0
            ? files.map((file) => ({
                id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
                filename: file.name,
                path: '',
                mimeType: file.type,
                size: file.size,
              }))
            : undefined,
        mentions: mentions && mentions.length > 0 ? mentions : undefined,
      })

      try {
        const { tuyau } = await import('@/api/client')

        const payload = await buildInvokePayload({
          message: trimmedMessage,
          canvasId,
          invocationId,
          editedInvocationId,
          selectedNodeIds,
          files,
          mentionedNodeIds,
          textSelection,
          store,
          yoloMode: state.yoloMode,
          agentMode: state.agentMode,
          source: options?.source,
        })

        const response = await tuyau.workspaces({ id: workspaceId }).agent.invoke.$post(payload)

        if (response.error) {
          throw response.error
        }

        if (!response.data) {
          throw new Error('Invocation request completed without a response payload')
        }

        const responseData = response.data
        const responsePayload = responseData as unknown
        const invokeStateSnapshot = extractInvokeStateSnapshot(responsePayload)
        const invokeTimeline = extractInvokeTimeline(responsePayload, responseData.invocationId)
        const isBlockedInvoke = isBlockedInvokePayload(responsePayload)
        const now = new Date().toISOString()
        const optimisticStatus: TaskListItem['status'] = isBlockedInvoke
          ? 'error'
          : invocationId || editedInvocationId
            ? 'processing'
            : 'initiated'

        state.invocationId = responseData.invocationId
        state.activeTaskId = responseData.taskId
        state.panelView = 'chat'

        if (invokeTimeline) {
          state.timeline = invokeTimeline
          state.streamingItems = {}
        }

        if (invokeStateSnapshot) {
          queryClient.setQueryData<InvocationStateResponse>(invocationStateQueryKey(responseData.invocationId), {
            invocationId: responseData.invocationId,
            state: invokeStateSnapshot,
          })
        }

        queryClient.setQueryData<TaskListResponse>(taskListQueryKey(workspaceId), (current) => {
          const createTask = (): TaskListItem => ({
            taskId: responseData.taskId,
            rootInvocationId: responseData.invocationId,
            latestInvocationId: responseData.invocationId,
            status: optimisticStatus,
            title: 'New task',
            description: trimmedMessage,
            modifiedFolders: [],
            createdAt: now,
            updatedAt: now,
          })

          return upsertTaskListResponse({
            current,
            taskId: responseData.taskId,
            createTask,
            updateTask: (existingTask) => {
              const isRootEdit = !!editedInvocationId && existingTask.rootInvocationId === editedInvocationId

              return {
                ...existingTask,
                rootInvocationId: isRootEdit ? responseData.invocationId : existingTask.rootInvocationId,
                latestInvocationId: responseData.invocationId,
                status: optimisticStatus,
                description: isRootEdit ? existingTask.description : existingTask.description || trimmedMessage,
                updatedAt: now,
              }
            },
          }).next
        })

        void queryClient.invalidateQueries({
          queryKey: taskListQueryKey(workspaceId),
          refetchType: 'active',
        })

        return {
          ok: true as const,
          invocationId: responseData.invocationId,
          taskId: responseData.taskId,
        }
      } catch (error) {
        state.timeline = previousState.timeline
        state.streamingItems = previousState.streamingItems
        state.activeTaskId = previousState.activeTaskId
        state.invocationId = previousState.invocationId
        state.isHydratingTask = previousState.isHydratingTask
        state.panelView = previousState.panelView

        console.error('Failed to invoke agent:', error)
        showToast('Failed to send message. Please try again.', 'error')

        return {
          ok: false as const,
          error,
        }
      }
    },
    [state, workspaceId, store, queryClient]
  )
}

export const useOpenTask = () => {
  const { state } = useChat()
  const queryClient = useQueryClient()
  const hydrationRequestIdRef = useRef(0)

  return useCallback(
    async (task: TaskListItem) => {
      const requestId = ++hydrationRequestIdRef.current
      const isSameInvocation = state.invocationId === task.latestInvocationId

      state.isHydratingTask = true
      state.panelView = 'chat'
      state.activeTaskId = task.taskId
      state.invocationId = task.latestInvocationId

      if (!isSameInvocation) {
        state.timeline = []
        state.streamingItems = {}
      }

      try {
        const invocationState = await queryClient.fetchQuery(getInvocationStateQueryOptions(task.latestInvocationId))
        const timeline = getInvocationTimeline(invocationState)

        if (hydrationRequestIdRef.current !== requestId) {
          return
        }

        if (state.activeTaskId !== task.taskId || state.invocationId !== task.latestInvocationId) {
          return
        }

        if (timeline && state.timeline.length === 0) {
          state.timeline = timeline
        }
      } finally {
        if (hydrationRequestIdRef.current === requestId) {
          state.isHydratingTask = false
        }
      }
    },
    [queryClient, state]
  )
}

export const usePrefetchTaskInvocation = () => {
  const { state } = useChat()
  const queryClient = useQueryClient()

  return useCallback(
    (task: TaskListItem) => {
      if (!task.latestInvocationId || state.invocationId === task.latestInvocationId) {
        return
      }

      void queryClient.prefetchQuery(getInvocationStateQueryOptions(task.latestInvocationId))
    },
    [queryClient, state]
  )
}

export const useClearConversation = () => {
  const { state, clearPersistedState } = useChat()
  const queryClient = useQueryClient()

  return useCallback(async () => {
    // Clear persisted state from sessionStorage
    await clearPersistedState()

    // Reset to initial state
    state.timeline = []
    state.invocationId = null
    state.activeTaskId = null
    state.isHydratingTask = false
    state.panelView = 'tasks'
    state.streamingItems = {}

    // Invalidate React Query cache
    queryClient.invalidateQueries({ queryKey: ['invocation'] })
  }, [state, clearPersistedState, queryClient])
}

export const useStartNewTask = () => {
  const { state, clearPersistedState } = useChat()
  const queryClient = useQueryClient()

  return useCallback(async () => {
    // Clear persisted state from sessionStorage
    await clearPersistedState()

    // Reset to initial state but stay in chat view for immediate typing
    state.timeline = []
    state.invocationId = null
    state.activeTaskId = null
    state.isHydratingTask = false
    state.panelView = 'chat'
    state.streamingItems = {}

    // Invalidate React Query cache
    queryClient.invalidateQueries({ queryKey: ['invocation'] })
  }, [state, clearPersistedState, queryClient])
}

export const useSetYoloMode = () => {
  const { state } = useChat()

  return useCallback(
    (enabled: boolean) => {
      state.yoloMode = enabled
    },
    [state]
  )
}

export const useSetAgentMode = () => {
  const { state } = useChat()

  return useCallback(
    (mode: AgentMode) => {
      state.agentMode = mode
    },
    [state]
  )
}

export const useInterruptAgent = () => {
  const { state } = useChat()

  return useCallback(
    async (reason?: string) => {
      if (!state.invocationId) {
        return
      }

      try {
        const { tuyau } = await import('@/api/client')

        const command = {
          type: 'cancel_operation' as const,
          reason,
        }

        const response = await tuyau.agent.invocations({ invocationId: state.invocationId }).command.$post(command)
        const timeline = extractInvokeTimeline(response.data, state.invocationId)

        if (timeline) {
          state.timeline = timeline
          state.streamingItems = {}
        }
      } catch (error) {
        console.error('Failed to interrupt agent:', error)
      }
    },
    [state]
  )
}

export const useAnswerQuestion = () => {
  const { state } = useChat()
  const { workspaceId, store, activeCanvasId } = useWorkspace()
  const queryClient = useQueryClient()

  return useCallback(
    async (itemId: string, answers: Record<string, string[]>) => {
      if (!state.invocationId) {
        console.error('No invocation ID available')
        return
      }

      const workspaceContext = store.root
        ? formatWorkspaceInvokeContext(store, {
            canvasId: activeCanvasId,
          })
        : undefined

      const response = await answerInvocationQuestion(state.invocationId, itemId, {
        answers,
        canvas_id: activeCanvasId || null,
        mode: state.agentMode,
        yolo_mode: state.yoloMode,
        workspace_tree: workspaceContext?.workspaceTree,
        canvas_path: workspaceContext?.canvasPath ?? undefined,
        active_canvas_context: workspaceContext?.activeCanvasContext ?? undefined,
        selected_node_paths: workspaceContext?.selectedNodePaths,
        mentioned_node_paths: workspaceContext?.mentionedNodePaths,
      })

      state.invocationId = response.invocationId
      state.activeTaskId = response.taskId
      state.panelView = 'chat'
      state.streamingItems = {}

      const invocationState = {
        invocationId: response.invocationId,
        state: response.state,
      }
      const timeline = getInvocationTimeline(invocationState)
      if (timeline) {
        state.timeline = timeline
      }

      queryClient.setQueryData<InvocationStateResponse>(invocationStateQueryKey(response.invocationId), invocationState)
      void queryClient.invalidateQueries({
        queryKey: taskListQueryKey(workspaceId),
        refetchType: 'active',
      })
    },
    [activeCanvasId, queryClient, state, store, workspaceId]
  )
}
