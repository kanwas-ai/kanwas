import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInterruptAgent } from '@/providers/chat/hooks'

const mocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  postCommand: vi.fn(),
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

vi.mock('@/api/client', () => ({
  tuyau: {
    agent: {
      invocations: () => ({
        command: {
          $post: mocks.postCommand,
        },
      }),
    },
  },
}))

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('useInterruptAgent', () => {
  it('applies recovered stop state from the command response', async () => {
    const recoveredTimeline = [
      {
        id: 'user-1',
        type: 'user_message',
        message: 'Run task',
        timestamp: 1,
        invocationId: 'invocation-1',
      },
      {
        id: 'error-1',
        type: 'error',
        error: {
          code: 'AGENT_PROCESS_LOST',
          message: 'The agent process stopped unexpectedly. Start a new message to continue.',
          timestamp: 2,
        },
        timestamp: 2,
      },
    ]
    const state = {
      invocationId: 'invocation-1',
      timeline: [
        {
          id: 'user-1',
          type: 'user_message',
          message: 'Run task',
          timestamp: 1,
          invocationId: 'invocation-1',
        },
      ],
      streamingItems: {
        'tool-1': {
          type: 'tool',
          text: 'running',
          lastUpdated: 1,
        },
      },
    }

    mocks.useChat.mockReturnValue({ state })
    mocks.postCommand.mockResolvedValue({
      data: {
        success: true,
        recovered: true,
        state: {
          state: {
            provider: 'openai',
            messages: [],
            timeline: recoveredTimeline,
          },
        },
      },
    })

    const interruptAgent = useInterruptAgent() as (reason?: string) => Promise<void>
    await interruptAgent('User clicked stop')

    expect(mocks.postCommand).toHaveBeenCalledWith({
      type: 'cancel_operation',
      reason: 'User clicked stop',
    })
    expect(state.timeline).toEqual(recoveredTimeline)
    expect(state.streamingItems).toEqual({})
  })
})
