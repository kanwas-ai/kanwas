import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSendMessage } from '@/providers/chat/hooks'

const mocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  useWorkspace: vi.fn(),
  useGetMountedKanwasEditor: vi.fn(),
  showToast: vi.fn(),
  formatWorkspaceInvokeContext: vi.fn(() => ({
    workspaceTree: '/workspace',
    canvasPath: null,
    activeCanvasContext: null,
    selectedNodePaths: undefined,
    mentionedNodePaths: undefined,
  })),
  postInvoke: vi.fn(),
  tuyauWorkspaces: vi.fn(),
  queryClient: {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('react', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    ...react,
    useCallback: (fn: unknown) => fn,
    useRef: (value: unknown) => ({ current: value }),
  }
})

vi.mock('@/providers/chat', () => ({
  useChat: () => mocks.useChat(),
}))

vi.mock('@/providers/workspace', () => ({
  useWorkspace: () => mocks.useWorkspace(),
}))

vi.mock('@/providers/project-state', () => ({
  useGetMountedKanwasEditor: () => mocks.useGetMountedKanwasEditor(),
}))

vi.mock('@/utils/toast', () => ({
  showToast: mocks.showToast,
}))

vi.mock('shared', () => ({
  formatWorkspaceInvokeContext: (...args: unknown[]) => mocks.formatWorkspaceInvokeContext(...args),
}))

vi.mock('@/api/client', () => ({
  tuyau: {
    workspaces: (...args: unknown[]) => mocks.tuyauWorkspaces(...args),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function createState() {
  return {
    timeline: [
      {
        id: 'user-1',
        type: 'user_message',
        message: 'Initial request',
        timestamp: 1,
        invocationId: 'invocation-1',
      },
      {
        id: 'chat-1',
        type: 'chat',
        message: 'First answer',
        timestamp: 2,
      },
      {
        id: 'user-2',
        type: 'user_message',
        message: 'Follow-up question',
        timestamp: 3,
        invocationId: 'invocation-2',
      },
      {
        id: 'chat-2',
        type: 'chat',
        message: 'Second answer',
        timestamp: 4,
      },
    ],
    invocationId: 'invocation-latest',
    activeTaskId: 'task-1',
    panelView: 'chat',
    isHydratingTask: false,
    yoloMode: false,
    streamingItems: {
      'chat-2': {
        type: 'chat',
        text: 'streaming',
        lastUpdated: 10,
      },
    },
  }
}

function setupSendMessage() {
  const state = createState()

  mocks.useChat.mockReturnValue({ state })
  mocks.useWorkspace.mockReturnValue({
    workspaceId: 'workspace-1',
    store: { root: null },
  })
  mocks.useGetMountedKanwasEditor.mockReturnValue(() => null)

  return { state, sendMessage: useSendMessage() }
}

function createTaskListResponse() {
  return {
    tasks: [
      {
        taskId: 'task-1',
        rootInvocationId: 'invocation-1',
        latestInvocationId: 'invocation-2',
        status: 'complete',
        title: 'Existing task',
        description: 'Initial request',
        modifiedFolders: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    nextCursor: null,
  }
}

function lastInvokePayload(): Record<string, unknown> {
  const payload = mocks.postInvoke.mock.calls.at(-1)?.[0]
  if (!payload || typeof payload !== 'object') {
    throw new Error('Expected invoke payload to be captured')
  }

  return payload as Record<string, unknown>
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.formatWorkspaceInvokeContext.mockReturnValue({
    workspaceTree: '/workspace',
    canvasPath: null,
    activeCanvasContext: null,
    selectedNodePaths: undefined,
    mentionedNodePaths: undefined,
  })
  mocks.tuyauWorkspaces.mockReturnValue({
    agent: {
      invoke: {
        $post: mocks.postInvoke,
      },
    },
  })
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('useSendMessage edit flow', () => {
  it('sends active canvas context in the invoke payload', async () => {
    const state = createState()
    const store = { root: { id: 'root' } }
    mocks.useChat.mockReturnValue({ state })
    mocks.useWorkspace.mockReturnValue({
      workspaceId: 'workspace-1',
      store,
    })
    mocks.useGetMountedKanwasEditor.mockReturnValue(() => null)
    mocks.formatWorkspaceInvokeContext.mockReturnValue({
      workspaceTree: '/workspace\n`-- research',
      canvasPath: 'research',
      activeCanvasContext: 'Active canvas: /workspace/research/\n\nSections:\n- none',
      selectedNodePaths: ['research/selected.text.yaml'],
      mentionedNodePaths: ['research/mentioned.sticky.yaml'],
    })
    mocks.postInvoke.mockResolvedValue({
      data: {
        invocationId: 'invocation-3',
        taskId: 'task-1',
      },
    })

    const result = await useSendMessage()(
      'Question',
      'canvas-1',
      'invocation-1',
      ['node-1', 'node-2'],
      undefined,
      ['node-2'],
      undefined,
      null
    )

    expect(result).toEqual({
      ok: true,
      invocationId: 'invocation-3',
      taskId: 'task-1',
    })
    expect(mocks.formatWorkspaceInvokeContext).toHaveBeenCalledWith(store, {
      canvasId: 'canvas-1',
      selectedNodeIds: ['node-1'],
      mentionedNodeIds: ['node-2'],
    })
    expect(lastInvokePayload()).toMatchObject({
      workspace_tree: '/workspace\n`-- research',
      canvas_path: 'research',
      active_canvas_context: 'Active canvas: /workspace/research/\n\nSections:\n- none',
      selected_node_paths: ['research/selected.text.yaml'],
      mentioned_node_paths: ['research/mentioned.sticky.yaml'],
    })
  })

  it('optimistically truncates later history and sends edited_invocation_id', async () => {
    const deferred = createDeferred<{ data: { invocationId: string; taskId: string } }>()
    mocks.postInvoke.mockReturnValue(deferred.promise)

    const { state, sendMessage } = setupSendMessage()

    const sendPromise = sendMessage(
      'Edited follow-up question',
      'canvas-1',
      null,
      null,
      undefined,
      null,
      undefined,
      null,
      {
        edit: {
          editedInvocationId: 'invocation-2',
          editedTimelineItemId: 'user-2',
        },
      }
    )

    expect(state.activeTaskId).toBe('task-1')
    expect(state.streamingItems).toEqual({})
    expect(state.timeline).toHaveLength(3)
    expect(state.timeline.map((item) => item.id)).toEqual(['user-1', 'chat-1', state.timeline[2].id])
    expect(state.timeline[2]).toMatchObject({
      type: 'user_message',
      message: 'Edited follow-up question',
    })

    await flushMicrotasks()

    const payload = lastInvokePayload()
    expect(payload).toMatchObject({
      query: 'Edited follow-up question',
      canvas_id: 'canvas-1',
      edited_invocation_id: 'invocation-2',
    })
    expect(payload).not.toHaveProperty('invocation_id')

    deferred.resolve({
      data: {
        invocationId: 'invocation-3',
        taskId: 'task-1',
      },
    })

    await expect(sendPromise).resolves.toEqual({
      ok: true,
      invocationId: 'invocation-3',
      taskId: 'task-1',
    })
    expect(state.invocationId).toBe('invocation-3')
    expect(state.activeTaskId).toBe('task-1')
  })

  it('restores the previous timeline when an edit request fails', async () => {
    const error = new Error('edit failed')
    mocks.postInvoke.mockRejectedValue(error)

    const { state, sendMessage } = setupSendMessage()
    const previousTimeline = [...state.timeline]
    const previousStreamingItems = { ...state.streamingItems }

    const result = await sendMessage(
      'Edited follow-up question',
      'canvas-1',
      null,
      null,
      undefined,
      null,
      undefined,
      null,
      {
        edit: {
          editedInvocationId: 'invocation-2',
          editedTimelineItemId: 'user-2',
        },
      }
    )

    expect(result).toEqual({
      ok: false,
      error,
    })
    expect(state.timeline).toEqual(previousTimeline)
    expect(state.streamingItems).toEqual(previousStreamingItems)
    expect(state.activeTaskId).toBe('task-1')
    expect(state.invocationId).toBe('invocation-latest')
    expect(mocks.showToast).toHaveBeenCalledWith('Failed to send message. Please try again.', 'error')
  })

  it('keeps task metadata unchanged for root edits while repointing task invocations', async () => {
    let taskListCache = createTaskListResponse()

    mocks.queryClient.setQueryData.mockImplementation((queryKey, updater) => {
      if (Array.isArray(queryKey) && queryKey[0] === 'tasks' && typeof updater === 'function') {
        taskListCache = updater(taskListCache)
      }
    })
    mocks.postInvoke.mockResolvedValue({
      data: {
        invocationId: 'invocation-3',
        taskId: 'task-1',
      },
    })

    const { sendMessage } = setupSendMessage()

    const result = await sendMessage(
      'Rewritten root prompt',
      'canvas-1',
      null,
      null,
      undefined,
      null,
      undefined,
      null,
      {
        edit: {
          editedInvocationId: 'invocation-1',
          editedTimelineItemId: 'user-1',
        },
      }
    )

    expect(result).toEqual({
      ok: true,
      invocationId: 'invocation-3',
      taskId: 'task-1',
    })
    expect(taskListCache.tasks).toHaveLength(1)
    expect(taskListCache.tasks[0]).toMatchObject({
      taskId: 'task-1',
      rootInvocationId: 'invocation-3',
      latestInvocationId: 'invocation-3',
      status: 'processing',
      title: 'Existing task',
      description: 'Initial request',
    })
  })
})
