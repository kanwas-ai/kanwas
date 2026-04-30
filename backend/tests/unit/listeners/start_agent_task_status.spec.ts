import { test } from '@japa/runner'
import type { SocketioServer } from '#contracts/socketio_server'
import StartAgent from '#listeners/start_agent'
import type BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import type AgentRuntimeService from '#services/agent_runtime_service'
import type ComposioService from '#services/composio_service'
import TaskLifecycleService from '#services/task_lifecycle_service'

type StartAgentTaskStatusResolver = {
  resolveTaskTerminalStatus: (lastEventType: string | undefined, executionError: unknown) => 'complete' | 'error' | null
  resolveTaskRealtimeStatus: (eventType: string | undefined) => 'processing' | 'waiting' | null
}

function createStartAgent(): StartAgent {
  return new StartAgent(
    {} as SocketioServer,
    {} as TaskLifecycleService,
    {} as AgentRuntimeService,
    {} as BackgroundAgentExecutionService,
    {} as ComposioService
  )
}

function resolveTaskTerminalStatus(startAgent: StartAgent, lastEventType: string | undefined, executionError: unknown) {
  return (startAgent as unknown as StartAgentTaskStatusResolver).resolveTaskTerminalStatus(
    lastEventType,
    executionError
  )
}

function resolveTaskRealtimeStatus(startAgent: StartAgent, eventType: string | undefined) {
  return (startAgent as unknown as StartAgentTaskStatusResolver).resolveTaskRealtimeStatus(eventType)
}

test.group('StartAgent task status resolution', () => {
  test('maps execution_interrupted to complete', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskTerminalStatus(startAgent, 'execution_interrupted', null)

    assert.equal(status, 'complete')
  })

  test('falls back to error when execution crashes without terminal event', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskTerminalStatus(startAgent, undefined, new Error('boom'))

    assert.equal(status, 'error')
  })

  test('returns null when there is no terminal event and no execution error', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskTerminalStatus(startAgent, undefined, null)

    assert.isNull(status)
  })

  test('maps ask_question_created to waiting', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskRealtimeStatus(startAgent, 'ask_question_created')

    assert.equal(status, 'waiting')
  })

  test('maps ask_question_answered to processing', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskRealtimeStatus(startAgent, 'ask_question_answered')

    assert.equal(status, 'processing')
  })

  test('maps ask_question_cancelled to processing', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskRealtimeStatus(startAgent, 'ask_question_cancelled')

    assert.equal(status, 'processing')
  })

  test('ignores non-task realtime events', ({ assert }) => {
    const startAgent = createStartAgent()

    const status = resolveTaskRealtimeStatus(startAgent, 'thinking')

    assert.isNull(status)
  })
})
