import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { State } from '#agent/state'
import { suggestNextTasksTool, suggestNextTasksToolInputSchema } from '#agent/tools/suggest_next_tasks'
import User from '#models/user'
import WorkspaceSuggestedTaskService from '#services/workspace_suggested_task_service'
import { createTestWorkspace } from '#tests/helpers/workspace'

function createState(workspaceId: string, invocationSource: string | null = 'onboarding'): State {
  const state = new State()
  state.setEventStream({ emitEvent: () => undefined } as any)
  state.currentContext = {
    canvasId: null,
    workspaceId,
    organizationId: 'organization-id',
    userId: 'user-id',
    uploadedFiles: null,
    agentMode: 'thinking',
    yoloMode: false,
    selectedText: null,
    authToken: 'token',
    authTokenId: 'token-id',
    correlationId: 'corr-id',
    invocationId: 'invocation-id',
    aiSessionId: 'session-id',
    invocationSource,
    workspaceTree: null,
    canvasPath: null,
    activeCanvasContext: null,
    selectedNodePaths: null,
    mentionedNodePaths: null,
  }

  return state
}

function createExecContext(state: State, toolCallId: string) {
  return {
    toolCallId,
    experimental_context: {
      state,
      eventStream: { emitEvent: () => undefined },
      llm: {},
      sandboxManager: {},
      agent: { source: 'main' as const },
      flow: {},
      workspaceDocumentService: {},
      webSearchService: {},
      posthogService: {},
      traceContext: { traceId: 'trace-id', sessionId: 'session-id', activeParentSpanId: 'span-id' },
      traceIdentity: {
        distinctId: 'user-id',
        workspaceId: state.currentContext.workspaceId,
        organizationId: state.currentContext.organizationId,
        invocationId: state.currentContext.invocationId,
        correlationId: state.currentContext.correlationId,
      },
      providerName: 'anthropic' as const,
      supportsNativeTools: true,
      userId: state.currentContext.userId,
      abortSignal: new AbortController().signal,
    },
  }
}

function createDraft() {
  return {
    emoji: '🧭',
    headline: '  Review kickoff docs  ',
    description: ' Review the seeded docs and note the biggest open questions. ',
    prompt: ' Read the key docs and summarize the next steps. ',
  }
}

test.group('suggest_next_tasks tool', () => {
  test('schema accepts task drafts directly and rejects model-provided id/source fields', ({ assert }) => {
    const validResult = suggestNextTasksToolInputSchema.safeParse({
      scope: 'global',
      tasks: [createDraft()],
    })
    const idResult = suggestNextTasksToolInputSchema.safeParse({
      scope: 'global',
      tasks: [{ ...createDraft(), id: 'model-id' }],
    })
    const sourceResult = suggestNextTasksToolInputSchema.safeParse({
      scope: 'global',
      tasks: [{ ...createDraft(), source: 'onboarding' }],
    })

    assert.isTrue(validResult.success)
    assert.isFalse(idResult.success)
    assert.isFalse(sourceResult.success)
  })

  test('keeps local suggested tasks inline and leaves the seeded onboarding suggestion untouched', async ({
    assert,
  }) => {
    const user = await User.create({ email: 'suggest-local@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggest Local Workspace')
    const workspaceSuggestedTaskService = await app.container.make(WorkspaceSuggestedTaskService)

    await db.transaction(async (trx) => {
      await workspaceSuggestedTaskService.seedOnboardingTask(workspace.id, trx)
    })

    const state = createState(workspace.id)
    const result = await (suggestNextTasksTool as any).execute(
      { scope: 'local', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-local')
    )

    const item = state.findTimelineItem('tool-call-local') as any
    const persistedState = await workspaceSuggestedTaskService.getState(workspace.id)

    assert.equal(result, 'Saved 1 suggested task to the timeline.')
    assert.deepInclude(item, {
      type: 'suggested_tasks',
      scope: 'local',
      status: 'completed',
      hasPersistedCopy: false,
    })
    assert.isUndefined(item.tasks[0].source)
    assert.equal(persistedState.tasks[0]?.source, 'onboarding')
    assert.isNull(persistedState.generatedAt)
  })

  test('persists global suggested tasks and mirrors them into the timeline item', async ({ assert }) => {
    const user = await User.create({ email: 'suggest-global@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggest Global Workspace')
    const workspaceSuggestedTaskService = await app.container.make(WorkspaceSuggestedTaskService)

    await db.transaction(async (trx) => {
      await workspaceSuggestedTaskService.seedOnboardingTask(workspace.id, trx)
    })

    const state = createState(workspace.id)
    const result = await (suggestNextTasksTool as any).execute(
      { scope: 'global', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-global')
    )

    const item = state.findTimelineItem('tool-call-global') as any
    const persistedState = await workspaceSuggestedTaskService.getState(workspace.id)

    assert.equal(result, 'Saved 1 suggested task to the timeline and workspace tasks.')
    assert.deepInclude(item, {
      type: 'suggested_tasks',
      scope: 'global',
      status: 'completed',
      hasPersistedCopy: true,
    })
    assert.deepEqual(persistedState.tasks, item.tasks)
    assert.isNotNull(persistedState.generatedAt)
    assert.isUndefined(persistedState.tasks[0]?.source)
  })

  test('fails outside onboarding and reuses the same timeline item when retried with the same tool call id', async ({
    assert,
  }) => {
    const user = await User.create({ email: 'suggest-retry@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggest Retry Workspace')
    const state = createState(workspace.id, null)

    const firstResult = await (suggestNextTasksTool as any).execute(
      { scope: 'local', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-retry')
    )

    assert.include(firstResult, 'only available during onboarding')
    assert.equal(state.getTimeline().length, 1)
    assert.deepInclude(state.findTimelineItem('tool-call-retry') as object, {
      type: 'suggested_tasks',
      status: 'failed',
    })

    state.currentContext = {
      ...state.currentContext,
      invocationSource: 'onboarding',
    }

    const secondResult = await (suggestNextTasksTool as any).execute(
      { scope: 'local', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-retry')
    )

    assert.equal(secondResult, 'Saved 1 suggested task to the timeline.')
    assert.equal(state.getTimeline().length, 1)
    assert.deepInclude(state.findTimelineItem('tool-call-retry') as object, {
      type: 'suggested_tasks',
      status: 'completed',
    })
  })

  test('blocks repeat calls after a successful completion in the same onboarding invocation', async ({ assert }) => {
    const user = await User.create({ email: 'suggest-repeat@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggest Repeat Workspace')
    const state = createState(workspace.id)

    const firstResult = await (suggestNextTasksTool as any).execute(
      { scope: 'local', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-first')
    )
    const secondResult = await (suggestNextTasksTool as any).execute(
      { scope: 'global', tasks: [createDraft()] },
      createExecContext(state, 'tool-call-second')
    )

    assert.equal(firstResult, 'Saved 1 suggested task to the timeline.')
    assert.include(secondResult, 'already completed for this onboarding invocation')
    assert.equal(state.getTimeline().length, 2)
    assert.deepInclude(state.findTimelineItem('tool-call-second') as object, {
      type: 'suggested_tasks',
      status: 'failed',
      scope: 'global',
    })
  })
})
