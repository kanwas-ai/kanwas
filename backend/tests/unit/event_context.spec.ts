import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import { createEventContext } from '#contracts/event_context'

test.group('createEventContext', () => {
  test('should use correlationId from overrides when provided', async ({ assert }) => {
    const context = createEventContext({
      correlationId: 'override-id',
      userId: 'user-1',
    })

    assert.equal(context.correlationId, 'override-id')
  })

  test('should generate new UUID when HttpContext is not available', async ({ assert }) => {
    // Outside of HTTP request, HttpContext.get() returns null
    const context = createEventContext({ userId: 'user-1' })

    // Should be a valid UUID (fallback)
    assert.match(context.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  test('HttpContext.get() returns null outside of request', async ({ assert }) => {
    const ctx = HttpContext.get()
    assert.isNull(ctx)
  })
})
