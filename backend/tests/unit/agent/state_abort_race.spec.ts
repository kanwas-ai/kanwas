import { test } from '@japa/runner'
import { State } from '#agent/index'

test.group('State abort race handling', () => {
  test('preserves cancellation requested before abort controller exists', async ({ assert }) => {
    const state = new State()

    state.abort('cancelled-before-start')

    assert.isTrue(state.isAborted)

    const controller = state.createAbortController()
    assert.isTrue(controller.signal.aborted)
    assert.equal(controller.signal.reason, 'cancelled-before-start')
  })

  test('preserves cancellation without a reason', async ({ assert }) => {
    const state = new State()

    state.abort()

    assert.isTrue(state.isAborted)

    const controller = state.createAbortController()
    assert.isTrue(controller.signal.aborted)
    assert.exists(controller.signal.reason)
  })
})
