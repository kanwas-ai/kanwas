import { test } from '@japa/runner'
import sinon from 'sinon'
import ConnectionsController from '#controllers/connections_controller'
import { ToolkitRequiresCustomAuthConfigError } from '#services/composio_service'

function createResponseStub() {
  return {
    badRequest: sinon.stub().callsFake((payload: unknown) => ({ status: 400, ...(payload as object) })),
    ok: sinon.stub().callsFake((payload: unknown) => payload),
    internalServerError: sinon.stub().callsFake((payload: unknown) => ({ status: 500, ...(payload as object) })),
    notFound: sinon.stub().callsFake((payload: unknown) => ({ status: 404, ...(payload as object) })),
  }
}

test.group('ConnectionsController', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('returns structured initiate error when custom auth requirements lookup fails', async ({ assert }) => {
    const composioService = {
      initiateConnection: sinon.stub().rejects(new ToolkitRequiresCustomAuthConfigError('posthog')),
      getCustomAuthRequirements: sinon.stub().rejects(new Error('Composio unavailable')),
    }

    const controller = new ConnectionsController(composioService as any, {} as any)
    const response = createResponseStub()
    const logger = {
      error: sinon.stub(),
    }

    const result = await controller.initiate({
      params: { id: 'workspace-1' },
      auth: {
        getUserOrFail: () => ({ id: 'user-1' }),
      },
      request: {
        validateUsing: sinon.stub().resolves({
          toolkit: 'posthog',
          callbackUrl: 'https://app.kanwas.ai/connections/callback',
        }),
      },
      response,
      logger,
    } as any)

    assert.deepEqual(result, {
      status: 500,
      code: 'INITIATE_FAILED',
      error: 'Failed to initiate connection',
    })
    assert.isTrue(composioService.getCustomAuthRequirements.calledOnceWithExactly('posthog'))
    assert.isTrue(
      response.internalServerError.calledOnceWithExactly({
        code: 'INITIATE_FAILED',
        error: 'Failed to initiate connection',
      })
    )
    assert.isTrue(logger.error.calledOnce)
  })

  test('returns structured custom auth requirements server error', async ({ assert }) => {
    const composioService = {
      getCustomAuthRequirements: sinon.stub().rejects(new Error('Composio unavailable')),
    }

    const controller = new ConnectionsController(composioService as any, {} as any)
    const response = createResponseStub()
    const logger = {
      error: sinon.stub(),
    }

    const result = await controller.customAuthRequirements({
      request: {
        qs: sinon.stub().returns({ toolkit: 'posthog' }),
      },
      response,
      logger,
    } as any)

    assert.deepEqual(result, {
      status: 500,
      code: 'CUSTOM_AUTH_REQUIREMENTS_FAILED',
      error: 'Failed to load custom auth requirements',
    })
    assert.isTrue(
      response.internalServerError.calledOnceWithExactly({
        code: 'CUSTOM_AUTH_REQUIREMENTS_FAILED',
        error: 'Failed to load custom auth requirements',
      })
    )
    assert.isTrue(logger.error.calledOnce)
  })
})
