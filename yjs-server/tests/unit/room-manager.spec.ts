import { describe, expect, it, vi } from 'vitest'
import { NoopBackendNotifier } from '../../src/backend-notifier.js'
import { RoomManager } from '../../src/room-manager.js'
import type { DocumentStore } from '../../src/storage.js'
import { createDeferred, createNoopLogger } from '../helpers/test-utils.js'

const logger = createNoopLogger()

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

describe('RoomManager', () => {
  it('deduplicates concurrent room initialization', async () => {
    const deferred = createDeferred<Uint8Array | null>()
    const loadRoot = vi.fn(() => deferred.promise)

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store: createStore({ loadRoot }),
    })

    const roomPromiseA = manager.getRoom('workspace-1')
    const roomPromiseB = manager.getRoom('workspace-1')

    await Promise.resolve()
    expect(loadRoot).toHaveBeenCalledTimes(1)

    deferred.resolve(null)

    const [roomA, roomB] = await Promise.all([roomPromiseA, roomPromiseB])
    expect(roomA).toBe(roomB)

    await manager.destroyRoomIfEmpty('workspace-1', roomA)
  })

  it('cleans up failed initialization so a later retry can succeed', async () => {
    const loadRoot = vi
      .fn<() => Promise<Uint8Array | null>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(null)

    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store: createStore({ loadRoot }),
    })

    await expect(manager.getRoom('workspace-1')).rejects.toThrow('load failed')
    expect(manager.activeRoomCount).toBe(0)

    const room = await manager.getRoom('workspace-1')
    expect(loadRoot).toHaveBeenCalledTimes(2)
    expect(manager.activeRoomCount).toBe(1)

    await manager.destroyRoomIfEmpty('workspace-1', room)
  })

  it('reuses an in-flight destroy task for the same room', async () => {
    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store: createStore(),
    })

    const room = await manager.getRoom('workspace-1')
    const destroyDeferred = createDeferred<void>()
    const flushAndDestroy = vi.spyOn(room, 'flushAndDestroy').mockImplementation(() => destroyDeferred.promise)

    const destroyPromiseA = manager.destroyRoomIfEmpty('workspace-1', room)
    const destroyPromiseB = manager.destroyRoomIfEmpty('workspace-1', room)

    expect(flushAndDestroy).toHaveBeenCalledTimes(1)

    destroyDeferred.resolve()
    await Promise.all([destroyPromiseA, destroyPromiseB])

    expect(manager.activeRoomCount).toBe(0)
  })

  it('flushes all rooms on shutdown', async () => {
    const manager = new RoomManager({
      backendNotifier: new NoopBackendNotifier(),
      logger,
      saveDebounceMs: 5,
      store: createStore(),
    })

    const roomA = await manager.getRoom('workspace-a')
    const roomB = await manager.getRoom('workspace-b')
    const flushSpyA = vi.spyOn(roomA, 'flushAndDestroy')
    const flushSpyB = vi.spyOn(roomB, 'flushAndDestroy')

    await manager.shutdown()

    expect(flushSpyA).toHaveBeenCalledTimes(1)
    expect(flushSpyB).toHaveBeenCalledTimes(1)
    expect(manager.activeRoomCount).toBe(0)
  })
})
