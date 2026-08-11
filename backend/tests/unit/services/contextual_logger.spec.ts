import { test } from '@japa/runner'
import { ContextualLogger } from '#services/contextual_logger'
import type { LogContext } from '#contracts/log_context'

/**
 * Mock logger that captures log calls for verification
 */
class MockLogger {
  public calls: Array<{ level: string; args: unknown[] }> = []
  private _bindings: Record<string, unknown> = {}

  info(...args: unknown[]) {
    this.calls.push({ level: 'info', args })
  }

  warn(...args: unknown[]) {
    this.calls.push({ level: 'warn', args })
  }

  error(...args: unknown[]) {
    this.calls.push({ level: 'error', args })
  }

  debug(...args: unknown[]) {
    this.calls.push({ level: 'debug', args })
  }

  child(bindings: Record<string, unknown>) {
    const childLogger = new MockLogger()
    childLogger._bindings = { ...this._bindings, ...bindings }
    return childLogger
  }

  get bindings() {
    return this._bindings
  }
}

test.group('ContextualLogger', () => {
  test('should create instance with logger and context', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const context: LogContext = {
      correlationId: 'test-correlation-id',
      userId: 'test-user-id',
      workspaceId: 'test-workspace-id',
    }

    const contextualLogger = new ContextualLogger(mockLogger, context)

    assert.equal(contextualLogger.logger, mockLogger)
    assert.deepEqual(contextualLogger.context, context)
  })

  test('should create instance with empty context by default', async ({ assert }) => {
    const mockLogger = new MockLogger() as any

    const contextualLogger = new ContextualLogger(mockLogger)

    assert.deepEqual(contextualLogger.context, {})
  })

  test('child() should preserve original context', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const context: LogContext = {
      correlationId: 'parent-correlation-id',
      userId: 'parent-user-id',
    }

    const parentLogger = new ContextualLogger(mockLogger, context)
    const childLogger = parentLogger.child({ operation: 'test-operation' })

    // Context should be preserved (same reference)
    assert.deepEqual(childLogger.context, context)
  })

  test('child() should create new logger with additional bindings', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const context: LogContext = { correlationId: 'test-id' }

    const parentLogger = new ContextualLogger(mockLogger, context)
    const childLogger = parentLogger.child({ operation: 'test-operation' })

    // Verify the child logger has the bindings
    const childMockLogger = childLogger.logger as unknown as MockLogger
    assert.deepEqual(childMockLogger.bindings, { operation: 'test-operation' })
  })

  test('info() should log with object and message', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.info({ foo: 'bar' }, 'test message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'info')
    assert.deepEqual(mockLogger.calls[0].args, [{ foo: 'bar' }, 'test message'])
  })

  test('info() should log with message only', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.info('test message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'info')
    assert.deepEqual(mockLogger.calls[0].args, ['test message'])
  })

  test('warn() should log with object and message', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.warn({ warning: 'something' }, 'warning message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'warn')
    assert.deepEqual(mockLogger.calls[0].args, [{ warning: 'something' }, 'warning message'])
  })

  test('warn() should log with message only', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.warn('warning message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'warn')
    assert.deepEqual(mockLogger.calls[0].args, ['warning message'])
  })

  test('error() should log with object and message', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.error({ error: 'something' }, 'error message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'error')
    assert.deepEqual(mockLogger.calls[0].args, [{ error: 'something' }, 'error message'])
  })

  test('error() should log with message only', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.error('error message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'error')
    assert.deepEqual(mockLogger.calls[0].args, ['error message'])
  })

  test('debug() should log with object and message', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.debug({ debug: 'info' }, 'debug message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'debug')
    assert.deepEqual(mockLogger.calls[0].args, [{ debug: 'info' }, 'debug message'])
  })

  test('debug() should log with message only', async ({ assert }) => {
    const mockLogger = new MockLogger() as any
    const contextualLogger = new ContextualLogger(mockLogger)

    contextualLogger.debug('debug message')

    assert.lengthOf(mockLogger.calls, 1)
    assert.equal(mockLogger.calls[0].level, 'debug')
    assert.deepEqual(mockLogger.calls[0].args, ['debug message'])
  })
})

test.group('ContextualLogger.createFallback', () => {
  test('should create logger with provided context', async ({ assert }) => {
    const context: Partial<LogContext> = {
      correlationId: 'fallback-correlation-id',
      userId: 'fallback-user-id',
      component: 'TestComponent',
    }

    const logger = ContextualLogger.createFallback(context)

    assert.instanceOf(logger, ContextualLogger)
    assert.deepEqual(logger.context, context)
  })

  test('should create logger with empty context by default', async ({ assert }) => {
    const logger = ContextualLogger.createFallback()

    assert.instanceOf(logger, ContextualLogger)
    assert.deepEqual(logger.context, {})
  })

  test('should create logger that can log at all levels', async ({ assert }) => {
    const logger = ContextualLogger.createFallback({ component: 'Test' })

    // These should not throw
    logger.info({ test: 'value' }, 'info message')
    logger.warn({ test: 'value' }, 'warn message')
    logger.error({ test: 'value' }, 'error message')
    logger.debug({ test: 'value' }, 'debug message')

    assert.isTrue(true) // If we got here, no errors were thrown
  })

  test('should support component as custom context field', async ({ assert }) => {
    const logger = ContextualLogger.createFallback({
      component: 'StartAgent',
      workspaceId: 'workspace-123',
    })

    assert.equal(logger.context.component, 'StartAgent')
    assert.equal(logger.context.workspaceId, 'workspace-123')
  })
})
