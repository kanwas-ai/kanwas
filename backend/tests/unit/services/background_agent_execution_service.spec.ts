import { test } from '@japa/runner'
import sinon from 'sinon'
import { DateTime } from 'luxon'
import User from '#models/user'
import type Workspace from '#models/workspace'
import BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import type PostHogService from '#services/posthog_service'
import { SandboxRegistry } from '#services/sandbox_registry'

test.group('BackgroundAgentExecutionService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('identifies the user before returning AI execution context', async ({ assert }) => {
    const createAccessToken = sinon.stub(User.accessTokens, 'create').resolves({
      value: {
        release: () => 'token-value',
      },
      identifier: 'token-id',
    } as any)
    const deleteAccessToken = sinon.stub(User.accessTokens, 'delete').resolves()
    const shutdownInvocationSandbox = sinon.stub().resolves()
    const identifyUser = sinon.spy()
    const sandboxRegistry = {
      shutdownInvocationSandbox,
    } as unknown as SandboxRegistry
    const posthogService = {
      identifyUser,
    } as unknown as PostHogService
    const service = new BackgroundAgentExecutionService(sandboxRegistry, posthogService)

    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User One',
      createdAt: DateTime.fromISO('2026-03-15T10:00:00Z'),
      updatedAt: DateTime.fromISO('2026-03-16T10:00:00Z'),
    } as User
    const workspace = {
      id: 'workspace-1',
      organizationId: 'org-1',
    } as Workspace

    const preparedExecution = await service.prepareExecution({
      user,
      workspace,
      invocationId: 'invocation-1',
      aiSessionId: 'session-1',
      correlationId: 'corr-1',
      tokenExpiresIn: '2 hours',
      contextOverrides: {
        workspaceTree: 'workspace-tree',
      },
    })

    assert.lengthOf(createAccessToken.args, 1)
    assert.lengthOf(identifyUser.args, 1)
    assert.equal(identifyUser.firstCall.args[0].id, 'user-1')
    assert.equal(identifyUser.firstCall.args[0].email, 'user@example.com')
    assert.equal(preparedExecution.context.userId, 'user-1')
    assert.equal(preparedExecution.context.workspaceId, 'workspace-1')
    assert.equal(preparedExecution.context.organizationId, 'org-1')
    assert.equal(preparedExecution.context.authToken, 'token-value')
    assert.equal(preparedExecution.context.aiSessionId, 'session-1')
    assert.equal(preparedExecution.context.userName, 'User One')
    assert.equal(preparedExecution.context.workspaceTree, 'workspace-tree')

    await preparedExecution.cleanup()

    assert.lengthOf(shutdownInvocationSandbox.args, 1)
    assert.lengthOf(deleteAccessToken.args, 1)
  })
})
