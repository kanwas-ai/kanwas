import { test } from '@japa/runner'
import sinon from 'sinon'
import WorkspaceSuggestedTaskGenerationTriggerService, {
  WorkspaceSuggestedTaskGenerationTriggerError,
} from '#services/workspace_suggested_task_generation_trigger_service'

test.group('WorkspaceSuggestedTaskGenerationTriggerService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('marks the generation as failed and rethrows a wrapped error', async ({ assert }) => {
    const workspaceSuggestedTaskService = {
      beginGeneration: sinon.stub().resolves({ status: 'started' }),
      completeGeneration: sinon.stub(),
      failGeneration: sinon.stub().resolves({ status: 'failed' }),
    }

    const generationError = new Error('model provider exploded')
    const workspaceSuggestedTaskGenerationService = {
      generateForWorkspace: sinon.stub().rejects(generationError),
    }

    const service = new WorkspaceSuggestedTaskGenerationTriggerService(
      workspaceSuggestedTaskService as any,
      workspaceSuggestedTaskGenerationService as any
    )

    try {
      await service.triggerForWorkspace({
        workspaceId: 'workspace-1',
        triggeringUserId: 'user-1',
        correlationId: 'corr-1',
      })

      assert.fail('Expected suggested task generation trigger to throw')
    } catch (error) {
      const wrappedError = error as WorkspaceSuggestedTaskGenerationTriggerError

      assert.instanceOf(wrappedError, WorkspaceSuggestedTaskGenerationTriggerError)
      assert.instanceOf(wrappedError.cause, Error)
      assert.equal((wrappedError.cause as Error).message, generationError.message)
    }

    assert.isTrue(workspaceSuggestedTaskService.failGeneration.calledOnceWith('workspace-1', generationError.message))
    assert.isTrue(workspaceSuggestedTaskService.completeGeneration.notCalled)
  })
})
