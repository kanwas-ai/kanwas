import { test } from '@japa/runner'
import sinon from 'sinon'
import type { SocketioServer } from '#contracts/socketio_server'
import InvocationSubscribed from '#events/invocation_subscribed'
import SendInitialAgentState from '#listeners/send_initial_agent_state'
import Invocation from '#models/invocation'
import User from '#models/user'
import { SocketServerEvents, type AgentSocketMessage } from '#types/socketio'
import { createTestWorkspace } from '#tests/helpers/workspace'

async function createInvocationWithAgentState(email: string) {
  const user = await User.create({
    email,
    password: 'password123',
  })
  const workspace = await createTestWorkspace(user, 'Initial Agent State Workspace')
  const agentState: AgentSocketMessage = {
    event: {
      type: 'error',
      itemId: 'error-item',
      timestamp: 1,
    },
    state: {
      provider: 'openai',
      messages: [],
      timeline: [
        {
          id: 'error-item',
          type: 'error',
          error: {
            code: 'AGENT_PROCESS_LOST',
            message: 'The agent process stopped unexpectedly.',
            timestamp: 1,
          },
          timestamp: 1,
        },
      ],
    },
  } as AgentSocketMessage

  return Invocation.create({
    query: 'Recover this invocation',
    userId: user.id,
    workspaceId: workspace.id,
    canvasId: null,
    yoloMode: false,
    agentState,
  })
}

test.group('SendInitialAgentState', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('sends persisted agent state to the subscribing socket', async ({ assert }) => {
    const invocation = await createInvocationWithAgentState('initial-state-socket@example.com')
    const emit = sinon.stub()
    const to = sinon.stub().returns({ emit })
    const listener = new SendInitialAgentState({ to } as unknown as SocketioServer)

    await listener.handle(new InvocationSubscribed(invocation.id, `agent/${invocation.id}/events`, 'socket-id'))

    assert.isTrue(to.calledOnceWith('socket-id'))
    assert.isTrue(emit.calledOnceWith(SocketServerEvents.AGENT_MESSAGE, invocation.agentState))
  })

  test('falls back to the room channel when no socket id is provided', async ({ assert }) => {
    const invocation = await createInvocationWithAgentState('initial-state-room@example.com')
    const channel = `agent/${invocation.id}/events`
    const emit = sinon.stub()
    const to = sinon.stub().returns({ emit })
    const listener = new SendInitialAgentState({ to } as unknown as SocketioServer)

    await listener.handle(new InvocationSubscribed(invocation.id, channel))

    assert.isTrue(to.calledOnceWith(channel))
    assert.isTrue(emit.calledOnceWith(SocketServerEvents.AGENT_MESSAGE, invocation.agentState))
  })
})
