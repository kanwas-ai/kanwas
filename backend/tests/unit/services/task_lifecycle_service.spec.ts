import { test } from '@japa/runner'
import User from '#models/user'
import Invocation from '#models/invocation'
import Task from '#models/task'
import { createTestWorkspace } from '#tests/helpers/workspace'
import TaskLifecycleService, { DEFAULT_TASK_TITLE } from '#services/task_lifecycle_service'

test.group('TaskLifecycleService', () => {
  test('creates new tasks with default fallback title', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const invocation = await Invocation.create({
      query: 'Create a release checklist',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const service = new TaskLifecycleService()
    const result = await service.createTaskForNewInvocation({
      workspaceId: workspace.id,
      userId: user.id,
      invocationId: invocation.id,
      description: invocation.query,
    })

    assert.isTrue(result.created)
    assert.isTrue(result.changed)
    assert.equal(result.task.rootInvocationId, invocation.id)
    assert.equal(result.task.latestInvocationId, invocation.id)
    assert.equal(result.task.status, 'initiated')
    assert.equal(result.task.title, DEFAULT_TASK_TITLE)
    assert.equal(result.task.description, invocation.query)
  })

  test('updates task title only while title is still default', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const invocation = await Invocation.create({
      query: 'Draft launch announcement',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'initiated',
      title: DEFAULT_TASK_TITLE,
      description: invocation.query,
    })

    const service = new TaskLifecycleService()

    const firstUpdate = await service.updateTitleIfDefault(task.id, 'Launch announcement draft')
    assert.exists(firstUpdate)
    assert.equal(firstUpdate!.title, 'Launch announcement draft')

    const secondUpdate = await service.updateTitleIfDefault(task.id, 'Another generated title')
    assert.exists(secondUpdate)
    assert.equal(secondUpdate!.title, 'Launch announcement draft')

    await task.refresh()
    assert.equal(task.title, 'Launch announcement draft')
  })

  test('ignores blank and default replacement titles', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const invocation = await Invocation.create({
      query: 'Create sprint plan',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'initiated',
      title: DEFAULT_TASK_TITLE,
      description: invocation.query,
    })

    const service = new TaskLifecycleService()

    const blankResult = await service.updateTitleIfDefault(task.id, '   ')
    const defaultResult = await service.updateTitleIfDefault(task.id, DEFAULT_TASK_TITLE)

    assert.isNull(blankResult)
    assert.isNull(defaultResult)

    await task.refresh()
    assert.equal(task.title, DEFAULT_TASK_TITLE)
  })

  test('transitions task between waiting and processing for in-flight questions', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const invocation = await Invocation.create({
      query: 'Ask user for details',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'initiated',
      title: DEFAULT_TASK_TITLE,
      description: invocation.query,
    })

    const service = new TaskLifecycleService()

    await service.markInvocationWaiting(invocation.id)
    await task.refresh()
    assert.equal(task.status, 'waiting')

    await service.markInvocationProcessing(invocation.id)
    await task.refresh()
    assert.equal(task.status, 'processing')
  })

  test('does not downgrade terminal tasks when applying in-flight statuses', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const completeInvocation = await Invocation.create({
      query: 'Completed task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const errorInvocation = await Invocation.create({
      query: 'Errored task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const completeTask = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: completeInvocation.id,
      latestInvocationId: completeInvocation.id,
      status: 'complete',
      title: DEFAULT_TASK_TITLE,
      description: completeInvocation.query,
    })

    const errorTask = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: errorInvocation.id,
      latestInvocationId: errorInvocation.id,
      status: 'error',
      title: DEFAULT_TASK_TITLE,
      description: errorInvocation.query,
    })

    const service = new TaskLifecycleService()

    await service.markInvocationWaiting(completeInvocation.id)
    await service.markInvocationProcessing(completeInvocation.id)
    await completeTask.refresh()
    assert.equal(completeTask.status, 'complete')

    await service.markInvocationWaiting(errorInvocation.id)
    await service.markInvocationProcessing(errorInvocation.id)
    await errorTask.refresh()
    assert.equal(errorTask.status, 'error')
  })

  test('merges modified folders onto the task thread', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Task Lifecycle Workspace')
    const rootInvocation = await Invocation.create({
      query: 'Root task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const followUpInvocation = await Invocation.create({
      query: 'Follow up task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      parentInvocationId: rootInvocation.id,
      agentState: null,
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: rootInvocation.id,
      latestInvocationId: followUpInvocation.id,
      status: 'processing',
      title: DEFAULT_TASK_TITLE,
      description: rootInvocation.query,
      modifiedFolders: ['notes/archive'],
    })

    const service = new TaskLifecycleService()

    await service.mergeModifiedFolders(rootInvocation.id, ['specs/alpha', 'notes/archive', 'specs/beta'])

    await task.refresh()
    assert.deepEqual(task.modifiedFolders, ['notes/archive', 'specs/alpha', 'specs/beta'])
  })

  test('does not overwrite an existing terminal task status', async ({ assert }) => {
    const user = await User.create({
      email: 'terminal-guard@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Terminal Guard Workspace')
    const invocation = await Invocation.create({
      query: 'Already failed',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: invocation.id,
      latestInvocationId: invocation.id,
      status: 'error',
      title: DEFAULT_TASK_TITLE,
      description: invocation.query,
      modifiedFolders: [],
    })

    const service = new TaskLifecycleService()

    await service.markInvocationTerminal(invocation.id, 'complete')

    await task.refresh()
    assert.equal(task.status, 'error')
  })
})
