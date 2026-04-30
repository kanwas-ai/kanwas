import React, { useEffect, use, type ReactNode, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { persist } from 'valtio-persist'
import { SessionStorageStrategy } from 'valtio-persist'
import { ChatContext, type ChatState, type DerivedChatState } from './ChatContext'
import { joinRoom, leaveRoom, socket } from '@/api/client'
import { applyRealtimeTaskUpsert, taskArchiveGuardQueryKey, taskListQueryKey, type TaskListResponse } from '@/api/tasks'
import { useAuth } from '@/providers/auth'
import { useQueryClient } from '@tanstack/react-query'
import { SocketChannels, SocketServerEvents, type TaskUpsertSocketMessage } from 'backend/socketio'
import type { AgentEvent, SerializedState } from 'backend/agent'
import type { AgentMode } from 'backend/agent'
import { getStreamingItemIdsToClear, toStreamingPatch } from './streaming'
import { getDerivedChatState } from './derived'

type AgentSocketMessage = {
  event: AgentEvent
  state: SerializedState
}

interface ChatProviderProps {
  children: ReactNode
  workspaceId: string
}

// Cache for persisted state promises per workspace
const persistedStateCache = new Map<string, Promise<{ store: ChatState; clear: () => Promise<void> }>>()
const DEFAULT_AGENT_MODE: AgentMode = 'thinking'

function getPersistedState(workspaceId: string) {
  if (!persistedStateCache.has(workspaceId)) {
    const promise = persist<ChatState>(
      {
        timeline: [],
        invocationId: null,
        panelView: 'tasks',
        activeTaskId: null,
        isHydratingTask: false,
        agentMode: DEFAULT_AGENT_MODE,
        yoloMode: false,
        streamingItems: {},
      },
      `workspace-${workspaceId}-chat-state`,
      {
        storageStrategy: SessionStorageStrategy,
      }
    )
    persistedStateCache.set(workspaceId, promise)
  }
  return persistedStateCache.get(workspaceId)!
}

function applyStreamingCleanup(state: ChatState, event: AgentSocketMessage['event']): void {
  const itemIdsToClear = getStreamingItemIdsToClear(event, state.streamingItems)

  if (itemIdsToClear === 'all') {
    state.streamingItems = {}
    return
  }

  for (const itemId of itemIdsToClear) {
    delete state.streamingItems[itemId]
  }
}

function applyTimelineFromState(state: ChatState, data: AgentSocketMessage): void {
  if (data.state && data.state.timeline) {
    state.timeline = data.state.timeline
  }
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children, workspaceId }) => {
  const queryClient = useQueryClient()
  const { state: authState } = useAuth()
  const authSnapshot = useSnapshot(authState)
  const persistedState = use(getPersistedState(workspaceId))
  const state = persistedState.store
  const clearPersistedState = persistedState.clear

  const snapshot = useSnapshot(state)

  useEffect(() => {
    state.panelView = 'tasks'
    if (state.activeTaskId === undefined) {
      state.activeTaskId = null
    }
    if (state.isHydratingTask === undefined) {
      state.isHydratingTask = false
    }
    if (state.agentMode !== 'thinking' && state.agentMode !== 'direct') {
      state.agentMode = DEFAULT_AGENT_MODE
    }
  }, [state])

  // Compute derived state from snapshot (derive-valtio doesn't work with useSnapshot)
  const derived: DerivedChatState = useMemo(
    () => getDerivedChatState({ timeline: snapshot.timeline, streamingItems: snapshot.streamingItems }),
    [snapshot.timeline, snapshot.streamingItems]
  )

  useEffect(() => {
    if (!snapshot.invocationId) return

    const channelName = `agent/${state.invocationId}/events`

    // Join the Socket.IO room
    joinRoom(channelName)

    // Listen for state messages (non-streaming events with full state payload)
    const handleMessage = (data: AgentSocketMessage) => {
      applyStreamingCleanup(state, data.event)
      applyTimelineFromState(state, data)
    }

    socket.on(SocketServerEvents.AGENT_MESSAGE, handleMessage)

    // Handler for lightweight streaming events (no full state payload)
    const handleStreaming = (event: AgentEvent) => {
      const previous = state.streamingItems[event.itemId]
      const patch = toStreamingPatch(event, previous)
      if (!patch) {
        return
      }

      state.streamingItems[patch.itemId] = patch.data
    }

    socket.on(SocketServerEvents.AGENT_STREAMING, handleStreaming)

    // Cleanup streaming state on disconnect
    const handleDisconnect = () => {
      state.streamingItems = {}
    }
    socket.on('disconnect', handleDisconnect)

    return () => {
      leaveRoom(channelName)
      socket.off(SocketServerEvents.AGENT_MESSAGE, handleMessage)
      socket.off(SocketServerEvents.AGENT_STREAMING, handleStreaming)
      socket.off('disconnect', handleDisconnect)
    }
  }, [snapshot.invocationId, state])

  useEffect(() => {
    const userId = authSnapshot.user?.id
    if (!userId) {
      return
    }

    const channelName = SocketChannels.taskEvents(workspaceId, userId)
    const refetchTasks = () => {
      void queryClient.invalidateQueries({
        queryKey: taskListQueryKey(workspaceId),
        refetchType: 'active',
      })
    }

    const handleTaskUpsert = (payload: TaskUpsertSocketMessage) => {
      const guardedTaskIds = queryClient.getQueryData<string[]>(taskArchiveGuardQueryKey(workspaceId)) ?? []

      let shouldRefetch = false
      let wasUpsertApplied = false

      queryClient.setQueryData<TaskListResponse>(taskListQueryKey(workspaceId), (current) => {
        const result = applyRealtimeTaskUpsert({
          current,
          payload,
          guardedTaskIds,
        })

        if (result.ignored) {
          return current
        }

        wasUpsertApplied = result.changed
        shouldRefetch = result.inserted

        return result.next
      })

      if (shouldRefetch) {
        refetchTasks()
      }

      if (wasUpsertApplied && state.activeTaskId === payload.taskId) {
        state.invocationId = payload.latestInvocationId
      }
    }

    joinRoom(channelName)
    socket.on(SocketServerEvents.TASK_UPSERT, handleTaskUpsert)
    socket.on('connect', refetchTasks)

    return () => {
      leaveRoom(channelName)
      socket.off(SocketServerEvents.TASK_UPSERT, handleTaskUpsert)
      socket.off('connect', refetchTasks)
    }
  }, [authSnapshot.user?.id, queryClient, state, workspaceId])

  const value = useMemo(() => ({ state, derived, clearPersistedState }), [state, derived, clearPersistedState])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
