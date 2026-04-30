import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import WorkspaceSuggestedTaskSet from '#models/workspace_suggested_task_set'
import WorkspaceSuggestedTaskService, {
  WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS,
  WORKSPACE_SUGGESTED_TASK_STALE_ERROR,
} from '#services/workspace_suggested_task_service'
import { WORKSPACE_ONBOARDING_PROMPT } from '#types/workspace_onboarding'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('WorkspaceSuggestedTaskService', () => {
  test('returns a safe default state when no row exists', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-default@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Default Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    const state = await service.getState(workspace.id)

    assert.deepEqual(state.tasks, [])
    assert.isFalse(state.isLoading)
    assert.isNull(state.generatedAt)
    assert.isNull(state.error)
  })

  test('auto-clears stale loading rows on read', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-stale@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Stale Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: true,
      tasks: [],
      errorMessage: null,
      generatedAt: null,
      loadingStartedAt: DateTime.utc().minus({ milliseconds: WORKSPACE_SUGGESTED_TASK_LOADING_TIMEOUT_MS + 1_000 }),
    })

    const state = await service.getState(workspace.id)
    const refreshed = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)

    assert.isFalse(state.isLoading)
    assert.deepEqual(state.tasks, [])
    assert.equal(state.error, WORKSPACE_SUGGESTED_TASK_STALE_ERROR)
    assert.isFalse(refreshed.isLoading)
    assert.equal(refreshed.errorMessage, WORKSPACE_SUGGESTED_TASK_STALE_ERROR)
  })

  test('seeds onboarding task with the shared onboarding prompt', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-onboarding-seed@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Onboarding Seed Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await db.transaction(async (trx) => {
      await service.seedOnboardingTask(workspace.id, trx)
    })

    const state = await service.getState(workspace.id)

    assert.lengthOf(state.tasks, 1)
    assert.equal(state.tasks[0].source, 'onboarding')
    assert.equal(state.tasks[0].prompt, WORKSPACE_ONBOARDING_PROMPT)
  })

  test('deletes suggestions idempotently', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-delete@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Delete Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [
        {
          id: 'first-task',
          emoji: '🧭',
          headline: 'First task',
          description: 'Start with the first task.',
          prompt: 'Do the first task.',
        },
        {
          id: 'second-task',
          emoji: '📝',
          headline: 'Second task',
          description: 'Start with the second task.',
          prompt: 'Do the second task.',
        },
      ],
      errorMessage: null,
      generatedAt: DateTime.utc(),
      loadingStartedAt: null,
    })

    const firstDelete = await service.deleteSuggestion(workspace.id, 'first-task')
    const secondDelete = await service.deleteSuggestion(workspace.id, 'first-task')

    assert.deepEqual(
      firstDelete.tasks.map((task) => task.id),
      ['second-task']
    )
    assert.deepEqual(
      secondDelete.tasks.map((task) => task.id),
      ['second-task']
    )
  })

  test('replaceTasksFromOnboarding swaps the seeded onboarding suggestion without loading flicker', async ({
    assert,
  }) => {
    const user = await User.create({ email: 'suggested-replace@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Replace Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [
        {
          id: 'onboarding-task',
          emoji: '👋',
          headline: 'Onboarding',
          description: 'Finish onboarding first.',
          prompt: 'Start onboarding.',
          source: 'onboarding',
        },
      ],
      errorMessage: 'stale error',
      generatedAt: null,
      loadingStartedAt: null,
    })

    const replaceResult = await service.replaceTasksFromOnboarding(workspace.id, [
      {
        id: 'review-docs',
        emoji: '🧭',
        headline: 'Review the docs',
        description: 'Review the seeded docs and capture the biggest open questions.',
        prompt: 'Review the key docs and summarize the next steps.',
      },
    ])

    assert.deepEqual(replaceResult, { status: 'replaced' })

    const refreshed = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    assert.isFalse(refreshed.isLoading)
    assert.deepEqual(refreshed.tasks, [
      {
        id: 'review-docs',
        emoji: '🧭',
        headline: 'Review the docs',
        description: 'Review the seeded docs and capture the biggest open questions.',
        prompt: 'Review the key docs and summarize the next steps.',
      },
    ])
    assert.isNull(refreshed.errorMessage)
    assert.isNotNull(refreshed.generatedAt)
    assert.isNull(refreshed.loadingStartedAt)
  })

  test('replaceTasksFromOnboarding rejects duplicate generated suggestions', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-replace-duplicate@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Replace Duplicate Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [
        {
          id: 'existing-task',
          emoji: '📝',
          headline: 'Existing task',
          description: 'Keep this generated task.',
          prompt: 'Keep the existing generated task.',
        },
      ],
      errorMessage: null,
      generatedAt: DateTime.utc(),
      loadingStartedAt: null,
    })

    const replaceResult = await service.replaceTasksFromOnboarding(workspace.id, [
      {
        id: 'replacement-task',
        emoji: '🧪',
        headline: 'Replacement task',
        description: 'This should not overwrite the generated tasks.',
        prompt: 'Do not replace the existing generated tasks.',
      },
    ])

    assert.deepEqual(replaceResult, { status: 'already_generated' })

    const refreshed = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    assert.equal(refreshed.tasks[0]?.id, 'existing-task')
  })

  test('beginGeneration clears current suggestions and marks the workspace as loading', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-begin@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Begin Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [
        {
          id: 'onboarding-task',
          emoji: '👋',
          headline: 'Onboarding',
          description: 'Finish onboarding first.',
          prompt: 'Start onboarding.',
          source: 'onboarding',
        },
      ],
      errorMessage: 'old error',
      generatedAt: null,
      loadingStartedAt: null,
    })

    const beginResult = await service.beginGeneration(workspace.id)

    assert.deepEqual(beginResult, { status: 'started' })

    const refreshed = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    assert.isTrue(refreshed.isLoading)
    assert.deepEqual(refreshed.tasks, [])
    assert.isNull(refreshed.errorMessage)
    assert.isNull(refreshed.generatedAt)
    assert.isNotNull(refreshed.loadingStartedAt)

    const secondBegin = await service.beginGeneration(workspace.id)
    assert.deepEqual(secondBegin, { status: 'already_loading' })
  })

  test('completeGeneration returns reasoned outcomes and persists successful completions', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-complete@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Complete Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    const missing = await service.completeGeneration(workspace.id, [])
    assert.deepEqual(missing, { status: 'missing' })

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [],
      errorMessage: null,
      generatedAt: null,
      loadingStartedAt: null,
    })

    const notLoading = await service.completeGeneration(workspace.id, [])
    assert.deepEqual(notLoading, { status: 'not_loading' })

    const row = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    row.isLoading = true
    row.loadingStartedAt = DateTime.utc()
    await row.save()

    const completed = await service.completeGeneration(workspace.id, [
      {
        id: 'completed-task',
        emoji: '📝',
        headline: 'Completed task',
        description: 'A completed suggestion.',
        prompt: 'Do the completed suggestion.',
      },
    ])
    assert.deepEqual(completed, { status: 'completed' })

    const completedRow = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    assert.isFalse(completedRow.isLoading)
    assert.isNull(completedRow.errorMessage)
    assert.equal(completedRow.tasks[0]?.id, 'completed-task')
    assert.isNotNull(completedRow.generatedAt)
  })

  test('failGeneration returns reasoned outcomes and persists failures', async ({ assert }) => {
    const user = await User.create({ email: 'suggested-fail@example.com', password: 'password123' })
    const workspace = await createTestWorkspace(user, 'Suggested Fail Workspace')
    const service = await app.container.make(WorkspaceSuggestedTaskService)

    const missing = await service.failGeneration(workspace.id, 'missing')
    assert.deepEqual(missing, { status: 'missing' })

    await WorkspaceSuggestedTaskSet.create({
      workspaceId: workspace.id,
      isLoading: false,
      tasks: [],
      errorMessage: null,
      generatedAt: null,
      loadingStartedAt: null,
    })

    const notLoading = await service.failGeneration(workspace.id, 'not-loading')
    assert.deepEqual(notLoading, { status: 'not_loading' })

    const row = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    row.isLoading = true
    row.loadingStartedAt = DateTime.utc()
    await row.save()

    const failed = await service.failGeneration(workspace.id, 'generation failed')
    assert.deepEqual(failed, { status: 'failed' })

    const failedRow = await WorkspaceSuggestedTaskSet.findByOrFail('workspaceId', workspace.id)
    assert.isFalse(failedRow.isLoading)
    assert.deepEqual(failedRow.tasks, [])
    assert.equal(failedRow.errorMessage, 'generation failed')
    assert.isNull(failedRow.generatedAt)
  })
})
