import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnswerQuestion } from '@/providers/chat/hooks'

const mocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  useWorkspace: vi.fn(),
  answerInvocationQuestion: vi.fn(),
  formatWorkspaceInvokeContext: vi.fn(() => ({
    workspaceTree: '/workspace\n`-- notes.md',
    canvasPath: '',
    activeCanvasContext: 'Active canvas context',
    selectedNodePaths: undefined,
    mentionedNodePaths: undefined,
  })),
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
  }
})

vi.mock('@/providers/chat', () => ({
  useChat: () => mocks.useChat(),
}))

vi.mock('@/providers/workspace', () => ({
  useWorkspace: () => mocks.useWorkspace(),
}))

vi.mock('shared', () => ({
  formatWorkspaceInvokeContext: (...args: unknown[]) => mocks.formatWorkspaceInvokeContext(...args),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('@/api/tasks', () => ({
  answerInvocationQuestion: (...args: unknown[]) => mocks.answerInvocationQuestion(...args),
  getInvocationState: vi.fn(),
  getInvocationTimeline: (response: any) => response?.state?.state?.timeline ?? null,
  invocationStateQueryKey: (invocationId: string) => ['invocation', invocationId],
  taskListQueryKey: (workspaceId: string) => ['tasks', workspaceId],
  upsertTaskListResponse: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAnswerQuestion', () => {
  it('answers through the durable endpoint and keeps the answer in the question card timeline', async () => {
    const answeredTimeline = [
      {
        id: 'ask-1',
        type: 'ask_question',
        questions: [],
        status: 'answered',
        answers: { q1: ['notes'] },
        timestamp: 1,
        agent: { source: 'main' },
      },
    ]
    const state = {
      invocationId: 'parent-invocation',
      activeTaskId: 'task-1',
      panelView: 'chat',
      timeline: [
        {
          id: 'ask-1',
          type: 'ask_question',
          questions: [],
          status: 'pending',
          timestamp: 1,
          agent: { source: 'main' },
        },
      ],
      streamingItems: {
        stream: {
          type: 'tool',
          text: 'question',
          lastUpdated: 1,
        },
      },
      agentMode: 'thinking',
      yoloMode: false,
    }

    mocks.useChat.mockReturnValue({ state })
    mocks.useWorkspace.mockReturnValue({
      workspaceId: 'workspace-1',
      store: { root: { id: 'root' } },
      activeCanvasId: 'canvas-1',
    })
    mocks.answerInvocationQuestion.mockResolvedValue({
      invocationId: 'parent-invocation',
      taskId: 'task-1',
      state: {
        state: {
          provider: 'openai',
          messages: [],
          timeline: answeredTimeline,
        },
      },
    })

    const answerQuestion = useAnswerQuestion() as (itemId: string, answers: Record<string, string[]>) => Promise<void>
    await answerQuestion('ask-1', { q1: ['notes'] })

    expect(mocks.answerInvocationQuestion).toHaveBeenCalledWith('parent-invocation', 'ask-1', {
      answers: { q1: ['notes'] },
      canvas_id: 'canvas-1',
      mode: 'thinking',
      yolo_mode: false,
      workspace_tree: '/workspace\n`-- notes.md',
      canvas_path: '',
      active_canvas_context: 'Active canvas context',
      selected_node_paths: undefined,
      mentioned_node_paths: undefined,
    })
    expect(state.invocationId).toBe('parent-invocation')
    expect(state.activeTaskId).toBe('task-1')
    expect(state.timeline).toEqual(answeredTimeline)
    expect(state.streamingItems).toEqual({})
  })
})
