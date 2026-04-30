import { test } from '@japa/runner'
import sinon from 'sinon'
import app from '@adonisjs/core/services/app'
import type { SocketioServer } from '#contracts/socketio_server'
import StartAgent from '#listeners/start_agent'
import AgentInvoked from '#events/agent_invoked'
import InvocationCompleted from '#events/invocation_completed'
import type BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import type AgentRuntimeService from '#services/agent_runtime_service'
import type TaskLifecycleService from '#services/task_lifecycle_service'
import type ComposioService from '#services/composio_service'
import { SUGGEST_NEXT_TASKS_TOOL_NAME } from '#agent/tools/suggest_next_tasks'
import WorkspaceSuggestedTaskGenerationTriggerService from '#services/workspace_suggested_task_generation_trigger_service'

function createStartAgentHarness() {
  const fakeSocketio = {
    to: () => ({ emit: () => {} }),
  } as unknown as SocketioServer

  const cleanup = sinon.stub().resolves()
  const fakeBackgroundAgentExecutionService = {} as BackgroundAgentExecutionService
  const fakeComposioService = {} as ComposioService

  const fakeTaskLifecycleService = {
    markInvocationProcessing: sinon.stub().resolves(),
  } as unknown as TaskLifecycleService

  const fakeAgentRuntimeService = {
    ownerId: 'test-runtime-owner',
    acquireLease: sinon.stub().resolves(true),
    refreshLease: sinon.stub().resolves(true),
    getCancelRequest: sinon.stub().resolves(null),
    persistAgentStateIfOwned: sinon.stub().resolves(true),
    persistExecutionErrorIfMissing: sinon.stub().resolves(false),
    releaseLease: sinon.stub().resolves(),
    isRecovered: sinon.stub().resolves(false),
  } as unknown as AgentRuntimeService

  const startAgent = new StartAgent(
    fakeSocketio,
    fakeTaskLifecycleService,
    fakeAgentRuntimeService,
    fakeBackgroundAgentExecutionService,
    fakeComposioService
  )
  const startAgentWithInternals = startAgent as any

  sinon.stub(startAgentWithInternals, 'subscribeToInvocationCommands').returns(async () => {})
  sinon.stub(startAgentWithInternals, 'hydrateFromParentInvocationIfAny').resolves()
  sinon.stub(startAgentWithInternals, 'buildPreparedAgentExecution').resolves({
    context: {
      canvasId: null,
      workspaceId: 'workspace-id',
      organizationId: 'organization-id',
      userId: 'user-id',
      auditActor: 'agent:user-id',
      auditTimestamp: new Date().toISOString(),
      uploadedFiles: null,
      agentMode: 'thinking',
      yoloMode: false,
      selectedText: null,
      authToken: 'token',
      authTokenId: 'token-id',
      correlationId: 'corr-id',
      invocationId: 'invocation-id',
      aiSessionId: 'session-id',
      invocationSource: null,
      workspaceTree: null,
      canvasPath: null,
      activeCanvasContext: null,
      selectedNodePaths: null,
      mentionedNodePaths: null,
    },
    cleanup,
  })
  sinon.stub(startAgentWithInternals, 'createInvocationStateSaver').returns({
    queue: async () => {},
    flush: async () => {},
  })
  sinon.stub(startAgentWithInternals, 'subscribeToAgentEvents').returns({
    flushTaskStatusUpdates: async () => {},
    dispose: () => {},
  })
  sinon.stub(startAgentWithInternals, 'persistFinalAgentState').resolves()
  sinon.stub(startAgentWithInternals, 'updateTaskAfterExecution').resolves()

  return {
    cleanup,
    startAgentWithInternals,
  }
}

test.group('StartAgent invocation completion dispatch', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('continues cleanup when InvocationCompleted dispatch fails', async ({ assert }) => {
    const { cleanup, startAgentWithInternals } = createStartAgentHarness()

    const fakeAgent = {
      resolveFlow: sinon.stub().resolves({}),
      getEventStream: sinon.stub().returns({
        on: () => {},
        removeAllListeners: () => {},
      }),
      getState: sinon.stub().returns({
        getLastAgentEvent: () => ({ type: 'execution_completed' }),
        toJSON: () => ({ provider: 'anthropic', anthropicMessages: [], timeline: [] }),
      }),
      execute: sinon.stub().resolves(),
    }

    sinon.stub(app.container, 'make').resolves(fakeAgent as any)

    const dispatchStub = sinon
      .stub(InvocationCompleted, 'dispatch')
      .rejects(new Error('InvocationCompleted dispatch failed'))

    const event = new AgentInvoked(
      {
        id: 'invocation-id',
        workspaceId: 'workspace-id',
        userId: 'user-id',
        parentInvocationId: null,
        query: 'test query',
        agentState: null,
      } as any,
      {
        correlationId: 'corr-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
        organizationId: 'organization-id',
      }
    )

    await startAgentWithInternals.executeAgent(event)

    assert.isTrue(dispatchStub.calledOnce)
    assert.isTrue(cleanup.calledOnce)
  })

  test('does not trigger background suggested task generation after onboarding suggests next tasks', async ({
    assert,
  }) => {
    const { startAgentWithInternals } = createStartAgentHarness()
    let requestedGenerationTrigger = false

    const fakeAgent = {
      resolveFlow: sinon.stub().resolves({}),
      getEventStream: sinon.stub().returns({
        on: () => {},
        removeAllListeners: () => {},
      }),
      getState: sinon.stub().returns({
        getLastAgentEvent: () => ({ type: 'execution_completed' }),
        toJSON: () => ({ provider: 'anthropic', anthropicMessages: [], timeline: [] }),
      }),
      execute: sinon.stub().resolves({
        messages: [],
        iterations: 1,
        toolResults: [
          {
            toolName: SUGGEST_NEXT_TASKS_TOOL_NAME,
            input: {
              scope: 'global',
              tasks: [
                {
                  emoji: '🧭',
                  headline: 'Review docs',
                  description: 'Review the core docs.',
                  prompt: 'Review the docs and suggest next steps.',
                },
              ],
            },
            output: 'Saved 1 suggested task to the timeline and workspace tasks.',
          },
        ],
        isTerminal: true,
        textOutput: 'Done.',
      }),
    }

    sinon.stub(app.container, 'make').callsFake(async (binding: unknown) => {
      if (binding === WorkspaceSuggestedTaskGenerationTriggerService) {
        requestedGenerationTrigger = true
      }

      return fakeAgent as any
    })
    sinon.stub(InvocationCompleted, 'dispatch')

    const event = new AgentInvoked(
      {
        id: 'invocation-id',
        workspaceId: 'workspace-id',
        userId: 'user-id',
        parentInvocationId: null,
        query: 'test query',
        agentState: null,
        source: 'onboarding',
      } as any,
      {
        correlationId: 'corr-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
        organizationId: 'organization-id',
      }
    )

    await startAgentWithInternals.executeAgent(event)

    assert.isFalse(requestedGenerationTrigger)
  })

  test('resumes an answered question from the same invocation state', async ({ assert }) => {
    const { startAgentWithInternals } = createStartAgentHarness()
    const savedState = {
      provider: 'openai',
      messages: [
        {
          role: 'user',
          content: 'The user answered the pending ask_question card.\n\nQ: Which file?\nA: notes.md',
        },
      ],
      timeline: [
        {
          id: 'ask-1',
          type: 'ask_question',
          questions: [],
          status: 'answered',
          answers: { q1: ['notes'] },
          timestamp: Date.now(),
          agent: { source: 'main' },
        },
      ],
    }
    const hydrateParentStub = startAgentWithInternals.hydrateFromParentInvocationIfAny as sinon.SinonStub

    const fakeAgent = {
      loadState: sinon.stub(),
      refreshPersistedAttachmentUrls: sinon.stub().resolves(false),
      resolveFlow: sinon.stub().resolves({}),
      getEventStream: sinon.stub().returns({
        on: () => {},
        removeAllListeners: () => {},
      }),
      getState: sinon.stub().returns({
        getLastAgentEvent: () => ({ type: 'execution_completed' }),
        toJSON: () => savedState,
      }),
      execute: sinon.stub().resolves({
        messages: [],
        iterations: 1,
        toolResults: [],
        isTerminal: true,
        textOutput: 'Done.',
      }),
    }

    sinon.stub(app.container, 'make').resolves(fakeAgent as any)
    sinon.stub(InvocationCompleted, 'dispatch')

    const event = new AgentInvoked(
      {
        id: 'invocation-id',
        workspaceId: 'workspace-id',
        userId: 'user-id',
        parentInvocationId: null,
        query: 'test query',
        agentState: {
          event: {
            type: 'ask_question_answered',
            itemId: 'ask-1',
            timestamp: Date.now(),
          },
          state: savedState,
        },
        source: null,
      } as any,
      {
        correlationId: 'corr-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
        organizationId: 'organization-id',
      }
    )

    await startAgentWithInternals.executeAgent(event)

    assert.isTrue(fakeAgent.loadState.calledOnceWith(savedState))
    assert.isTrue(hydrateParentStub.notCalled)
    assert.deepEqual(fakeAgent.execute.firstCall.args[4], { resumeFromState: true })
  })
})
