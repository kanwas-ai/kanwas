import { test } from '@japa/runner'
import InvocationCompleted from '#events/invocation_completed'
import SyncTaskModifiedFolders from '#listeners/sync_task_modified_folders'
import Invocation from '#models/invocation'
import Task from '#models/task'
import User from '#models/user'
import TaskLifecycleService, { DEFAULT_TASK_TITLE } from '#services/task_lifecycle_service'
import { createTestWorkspace } from '#tests/helpers/workspace'

test.group('SyncTaskModifiedFolders listener', () => {
  test('merges completed text editor folders into the root task', async ({ assert }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Listener Workspace')
    const rootInvocation = await Invocation.create({
      query: 'Root task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const followUpInvocation = await Invocation.create({
      query: 'Update docs',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      parentInvocationId: rootInvocation.id,
      agentState: {
        event: {
          type: 'execution_completed',
          itemId: 'done',
          timestamp: Date.now(),
        },
        state: {
          provider: 'anthropic',
          anthropicMessages: [],
          timeline: [
            {
              id: 'edit-docs',
              type: 'text_editor',
              command: 'create',
              path: '/workspace/docs/plan.md',
              status: 'completed',
              timestamp: Date.now(),
            },
            {
              id: 'ignored-view',
              type: 'text_editor',
              command: 'view',
              path: '/workspace/docs/plan.md',
              status: 'completed',
              timestamp: Date.now(),
            },
            {
              id: 'failed-edit',
              type: 'text_editor',
              command: 'insert',
              path: '/workspace/specs/brief.md',
              status: 'failed',
              timestamp: Date.now(),
            },
          ],
        },
      },
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: rootInvocation.id,
      latestInvocationId: followUpInvocation.id,
      status: 'complete',
      title: DEFAULT_TASK_TITLE,
      description: rootInvocation.query,
      modifiedFolders: ['notes/existing'],
    })

    const listener = new SyncTaskModifiedFolders(new TaskLifecycleService())
    const event = new InvocationCompleted(
      {
        invocationId: followUpInvocation.id,
        workspaceId: workspace.id,
        organizationId: workspace.organizationId,
        userId: user.id,
        blocked: false,
      },
      {
        correlationId: 'corr-id',
        userId: user.id,
        workspaceId: workspace.id,
        organizationId: workspace.organizationId,
      }
    )

    await listener.handle(event)

    await task.refresh()
    assert.deepEqual(task.modifiedFolders, ['docs', 'notes/existing'])
  })

  test('ignores blocked completion events', async ({ assert }) => {
    const user = await User.create({
      email: 'blocked@example.com',
      password: 'password123',
    })

    const workspace = await createTestWorkspace(user, 'Blocked Listener Workspace')
    const rootInvocation = await Invocation.create({
      query: 'Root task',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      agentState: null,
    })

    const followUpInvocation = await Invocation.create({
      query: 'Blocked update',
      userId: user.id,
      workspaceId: workspace.id,
      canvasId: null,
      yoloMode: false,
      parentInvocationId: rootInvocation.id,
      agentState: {
        event: {
          type: 'execution_completed',
          itemId: 'done',
          timestamp: Date.now(),
        },
        state: {
          provider: 'anthropic',
          anthropicMessages: [],
          timeline: [
            {
              id: 'edit-docs',
              type: 'text_editor',
              command: 'create',
              path: '/workspace/docs/blocked.md',
              status: 'completed',
              timestamp: Date.now(),
            },
          ],
        },
      },
    })

    const task = await Task.create({
      workspaceId: workspace.id,
      userId: user.id,
      rootInvocationId: rootInvocation.id,
      latestInvocationId: followUpInvocation.id,
      status: 'complete',
      title: DEFAULT_TASK_TITLE,
      description: rootInvocation.query,
      modifiedFolders: ['notes/existing'],
    })

    const listener = new SyncTaskModifiedFolders(new TaskLifecycleService())
    const event = new InvocationCompleted(
      {
        invocationId: followUpInvocation.id,
        workspaceId: workspace.id,
        organizationId: workspace.organizationId,
        userId: user.id,
        blocked: true,
      },
      {
        correlationId: 'corr-id',
        userId: user.id,
        workspaceId: workspace.id,
        organizationId: workspace.organizationId,
      }
    )

    await listener.handle(event)

    await task.refresh()
    assert.deepEqual(task.modifiedFolders, ['notes/existing'])
  })
})
