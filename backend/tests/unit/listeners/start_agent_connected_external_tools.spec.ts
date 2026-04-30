import { test } from '@japa/runner'
import sinon from 'sinon'
import type { SocketioServer } from '#contracts/socketio_server'
import StartAgent from '#listeners/start_agent'
import type BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import type AgentRuntimeService from '#services/agent_runtime_service'
import type ComposioService from '#services/composio_service'
import type TaskLifecycleService from '#services/task_lifecycle_service'

function createStartAgent(composioService: Partial<ComposioService>): StartAgent {
  return new StartAgent(
    {} as SocketioServer,
    {} as TaskLifecycleService,
    {} as AgentRuntimeService,
    {} as BackgroundAgentExecutionService,
    composioService as ComposioService
  )
}

function createLogger() {
  return {
    warn: sinon.spy(),
  }
}

test.group('StartAgent connected external tools context', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('filters, de-dupes, and sorts connected Composio toolkit display names', async ({ assert }) => {
    const composioService = {
      listWorkspaceConnectedToolkits: sinon.stub().resolves([
        {
          toolkit: 'slack',
          displayName: 'Slack',
          isConnected: true,
          connectedAccountId: 'ca_slack',
          isNoAuth: false,
        },
        {
          toolkit: 'posthog',
          displayName: 'PostHog',
          isConnected: true,
          isNoAuth: false,
        },
        {
          toolkit: 'github',
          displayName: 'GitHub',
          isConnected: true,
          connectedAccountId: 'ca_github',
          isNoAuth: false,
        },
        {
          toolkit: 'slack',
          displayName: 'Slack Duplicate',
          isConnected: true,
          connectedAccountId: 'ca_slack_duplicate',
          isNoAuth: false,
        },
      ]),
    }
    const startAgent = createStartAgent(composioService)
    const logger = createLogger()

    const context = await (startAgent as any).resolveConnectedExternalToolsContext(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      logger
    )

    assert.deepEqual(context, {
      connectedExternalTools: [
        { toolkit: 'github', displayName: 'GitHub' },
        { toolkit: 'slack', displayName: 'Slack' },
      ],
      connectedExternalToolsLookupCompleted: true,
    })
    assert.isTrue(composioService.listWorkspaceConnectedToolkits.calledOnceWithExactly('user-1', 'workspace-1'))
    assert.isTrue(logger.warn.notCalled)
  })

  test('returns an empty completed list when Composio lookup succeeds with no connected tools', async ({ assert }) => {
    const composioService = {
      listWorkspaceConnectedToolkits: sinon.stub().resolves([]),
    }
    const startAgent = createStartAgent(composioService)

    const context = await (startAgent as any).resolveConnectedExternalToolsContext(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      createLogger()
    )

    assert.deepEqual(context, {
      connectedExternalTools: [],
      connectedExternalToolsLookupCompleted: true,
    })
  })

  test('omits connected external tools context when Composio lookup fails', async ({ assert }) => {
    const composioService = {
      listWorkspaceConnectedToolkits: sinon.stub().rejects(new Error('Composio unavailable')),
    }
    const startAgent = createStartAgent(composioService)
    const logger = createLogger()

    const context = await (startAgent as any).resolveConnectedExternalToolsContext(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      logger
    )

    assert.deepEqual(context, {
      connectedExternalTools: null,
      connectedExternalToolsLookupCompleted: false,
    })
    assert.isTrue(logger.warn.calledOnce)
  })
})
