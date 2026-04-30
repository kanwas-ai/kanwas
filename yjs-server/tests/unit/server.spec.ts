import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../../src/logger.js'
import * as Y from 'yjs'
import type { RunningYjsServer } from '../../src/server.js'
import { startYjsServer } from '../../src/server.js'
import type { DocumentStore } from '../../src/storage.js'
import { createCapturingLogger, createNoopLogger } from '../helpers/test-utils.js'

function getBaseUrl(server: RunningYjsServer): string {
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected Yjs server to listen on an address object')
  }

  return `http://127.0.0.1:${address.port}`
}

function createStore(overrides: Partial<DocumentStore> = {}): DocumentStore {
  return {
    deleteNote: vi.fn(async () => undefined),
    loadNote: vi.fn(async () => null),
    loadRoot: vi.fn(async () => null),
    saveNote: vi.fn(async () => undefined),
    saveRoot: vi.fn(async () => undefined),
    ...overrides,
  }
}

function createRootBundle() {
  const doc = new Y.Doc()
  doc.getMap('state').set('root', {
    id: 'root',
    name: '',
    kind: 'canvas',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items: [],
  })

  return {
    notes: {},
    root: Buffer.from(Y.encodeStateAsUpdateV2(doc)).toString('base64'),
  }
}

describe('startYjsServer HTTP API', () => {
  let runningServer: RunningYjsServer | null = null

  afterEach(async () => {
    if (runningServer) {
      runningServer.httpServer.closeAllConnections?.()
      await runningServer.close()
      runningServer = null
    }
  })

  async function createServer(options?: { logger?: Logger; store?: DocumentStore }) {
    const store = options?.store ?? createStore()
    const backendNotifier = {
      notifyDocumentUpdated: vi.fn(async () => true),
    }

    runningServer = await startYjsServer({
      adminSecret: 'secret',
      backendNotifier,
      host: '127.0.0.1',
      logger: options?.logger ?? createNoopLogger(),
      port: 0,
      saveDebounceMs: 5,
      socketPingIntervalMs: 10 * 1000,
      socketPingTimeoutMs: 5 * 1000,
      store,
    })

    return {
      backendNotifier,
      baseUrl: getBaseUrl(runningServer),
      server: runningServer,
      store,
    }
  }

  it('reports server health and active room count', async () => {
    const { baseUrl, server } = await createServer()

    const initialResponse = await fetch(`${baseUrl}/health`)
    expect(initialResponse.status).toBe(200)
    await expect(initialResponse.json()).resolves.toEqual({ rooms: 0, status: 'ok' })

    await server.roomManager.getRoom('workspace-1')

    const populatedResponse = await fetch(`${baseUrl}/health`)
    await expect(populatedResponse.json()).resolves.toEqual({ rooms: 1, status: 'ok' })
  })

  it('rejects unknown routes, unauthorized mutations, and empty document payloads', async () => {
    const { baseUrl } = await createServer()

    const missingRouteResponse = await fetch(`${baseUrl}/missing`)
    expect(missingRouteResponse.status).toBe(404)
    await expect(missingRouteResponse.json()).resolves.toEqual({ error: 'Not found' })

    const unauthorizedResponse = await fetch(`${baseUrl}/documents/workspace-1/replace`, {
      body: JSON.stringify({ root: '', notes: {} }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(unauthorizedResponse.status).toBe(401)
    await expect(unauthorizedResponse.json()).resolves.toEqual({ error: 'Unauthorized' })

    const emptyPayloadResponse = await fetch(`${baseUrl}/documents/workspace-1/replace`, {
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(emptyPayloadResponse.status).toBe(400)
    await expect(emptyPayloadResponse.json()).resolves.toEqual({ error: 'Missing document payload' })

    const legacyBinaryPayloadResponse = await fetch(`${baseUrl}/documents/workspace-1/replace`, {
      body: Y.encodeStateAsUpdateV2(new Y.Doc()),
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/octet-stream',
      },
      method: 'POST',
    })
    expect(legacyBinaryPayloadResponse.status).toBe(400)
    await expect(legacyBinaryPayloadResponse.json()).resolves.toEqual({
      error: 'Expected application/json workspace snapshot bundle payload',
    })
  })

  it('logs rejected HTTP document mutations with useful context', async () => {
    const { entries, logger } = createCapturingLogger()
    const { baseUrl } = await createServer({ logger })

    await fetch(`${baseUrl}/documents/workspace-1/replace`, {
      body: JSON.stringify({ root: '', notes: {} }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    await fetch(`${baseUrl}/documents/workspace-1/replace`, {
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(entries).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          method: 'POST',
          path: '/documents/workspace-1/replace',
          stage: 'replace',
          statusCode: 401,
          workspaceId: 'workspace-1',
        }),
        level: 'warn',
        message: 'Rejected unauthorized HTTP document mutation',
      })
    )

    expect(entries).toContainEqual(
      expect.objectContaining({
        context: expect.objectContaining({
          notifyBackend: true,
          reason: 'replace',
          stage: 'replace',
          statusCode: 400,
        }),
        level: 'warn',
        message: 'Rejected HTTP document mutation without a valid payload',
      })
    )
  })

  it('forwards JSON snapshot bundles to the room manager and destroys empty rooms afterwards', async () => {
    const { baseUrl, server } = await createServer()
    const replaceSpy = vi.spyOn(server.roomManager, 'replaceDocument')
    const bundle = createRootBundle()

    const response = await fetch(`${baseUrl}/documents/workspace-1/replace?reason=manual&notifyBackend=false`, {
      body: JSON.stringify(bundle),
      headers: {
        'Authorization': 'Bearer secret',
        'Content-Type': 'application/json',
        'x-correlation-id': 'corr-http-1',
      },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy.mock.calls[0][0]).toBe('workspace-1')
    expect(replaceSpy.mock.calls[0][1]).toEqual(bundle)
    expect(replaceSpy.mock.calls[0][2]).toEqual({
      notifyBackend: false,
      reason: 'manual',
      stage: 'replace',
    })
    expect(replaceSpy.mock.calls[0][3]).toMatchObject({ correlationId: 'corr-http-1' })
    expect(server.roomManager.activeRoomCount).toBe(0)
  })
})
