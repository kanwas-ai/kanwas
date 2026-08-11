import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpBackendNotifier } from '../../src/backend-notifier.js'
import type { Logger } from '../../src/logger.js'

function createLoggerSpy(): Logger {
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  logger.child.mockReturnValue(logger)

  return logger
}

describe('HttpBackendNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('posts document update notifications to the backend', async () => {
    const logger = createLoggerSpy()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const notifier = new HttpBackendNotifier({
      backendApiSecret: 'secret',
      backendUrl: 'http://backend.test',
      logger,
    })

    await expect(notifier.notifyDocumentUpdated('workspace-1', 'save')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/workspaces/workspace-1/document/updated', {
      body: JSON.stringify({ source: 'yjs-server:save' }),
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  })

  it('forwards correlation IDs to backend notifications', async () => {
    const logger = createLoggerSpy()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const notifier = new HttpBackendNotifier({
      backendApiSecret: 'secret',
      backendUrl: 'http://backend.test',
      logger,
    })

    await expect(notifier.notifyDocumentUpdated('workspace-1', 'save', { correlationId: 'corr-123' })).resolves.toBe(
      true
    )

    expect(logger.child).toHaveBeenCalledWith({ correlationId: 'corr-123' })
    expect(fetchMock).toHaveBeenCalledWith('http://backend.test/workspaces/workspace-1/document/updated', {
      body: JSON.stringify({ source: 'yjs-server:save' }),
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/json',
        'x-correlation-id': 'corr-123',
      },
      method: 'POST',
    })
  })

  it('does not retry non-retryable 4xx responses', async () => {
    const logger = createLoggerSpy()
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }))

    const notifier = new HttpBackendNotifier({
      backendApiSecret: 'secret',
      backendUrl: 'http://backend.test',
      logger,
    })

    await expect(notifier.notifyDocumentUpdated('workspace-1', 'save')).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        backendUrl: 'http://backend.test',
        maxRetries: 3,
        responseBody: 'denied',
        stage: 'save',
        status: 403,
        workspaceId: 'workspace-1',
      }),
      'Backend notification failed with non-retryable response'
    )
  })

  it('retries save notifications after transient failures', async () => {
    vi.useFakeTimers()

    const logger = createLoggerSpy()
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const notifier = new HttpBackendNotifier({
      backendApiSecret: 'secret',
      backendUrl: 'http://backend.test',
      logger,
    })

    const resultPromise = notifier.notifyDocumentUpdated('workspace-1', 'save')

    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 3,
        backendUrl: 'http://backend.test',
        maxRetries: 3,
        stage: 'save',
        status: 200,
        workspaceId: 'workspace-1',
      }),
      'Backend notification succeeded after retry'
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('does not retry replace notifications after failure', async () => {
    vi.useFakeTimers()

    const logger = createLoggerSpy()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const notifier = new HttpBackendNotifier({
      backendApiSecret: 'secret',
      backendUrl: 'http://backend.test',
      logger,
    })

    const resultPromise = notifier.notifyDocumentUpdated('workspace-1', 'replace')

    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        backendUrl: 'http://backend.test',
        error: 'Backend notification failed with status 500',
        maxRetries: 1,
        stage: 'replace',
        status: 500,
        workspaceId: 'workspace-1',
      }),
      'Backend notification failed after retries'
    )
  })
})
