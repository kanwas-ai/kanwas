import { test } from '@japa/runner'
import sinon from 'sinon'
import locks from '@adonisjs/lock/services/main'
import ConnectionsCatalogRefreshRequested from '#events/connections_catalog_refresh_requested'
import RefreshConnectionsCatalog from '#listeners/refresh_connections_catalog'
import type { ConnectionStatus } from '#services/composio_service'

test.group('RefreshConnectionsCatalog listener', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('skips refresh when lock is not acquired', async ({ assert }) => {
    const composioService = {
      listGlobalToolkitCatalog: sinon.stub().resolves([]),
    }
    const cacheService = {
      writeCatalog: sinon.stub().resolves(),
    }

    const runImmediately = sinon.stub().resolves([false, undefined])
    const createLock = sinon.stub(locks, 'createLock').returns({ runImmediately } as any)

    const listener = new RefreshConnectionsCatalog(composioService as any, cacheService as any)
    await listener.handle(new ConnectionsCatalogRefreshRequested('stale'))

    assert.isTrue(createLock.calledOnce)
    assert.isTrue(composioService.listGlobalToolkitCatalog.notCalled)
    assert.isTrue(cacheService.writeCatalog.notCalled)
  })

  test('refreshes catalog when lock is acquired', async ({ assert }) => {
    const catalog: ConnectionStatus[] = [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        isConnected: false,
        isNoAuth: false,
      },
    ]

    const composioService = {
      listGlobalToolkitCatalog: sinon.stub().resolves(catalog),
    }
    const cacheService = {
      writeCatalog: sinon.stub().resolves(),
    }

    const runImmediately = sinon.stub().callsFake(async (callback: () => Promise<void>) => {
      await callback()
      return [true, undefined]
    })
    const createLock = sinon.stub(locks, 'createLock').returns({ runImmediately } as any)

    const listener = new RefreshConnectionsCatalog(composioService as any, cacheService as any)
    await listener.handle(new ConnectionsCatalogRefreshRequested('stale'))

    assert.isTrue(createLock.calledOnce)
    assert.isTrue(composioService.listGlobalToolkitCatalog.calledOnce)
    assert.isTrue(cacheService.writeCatalog.calledOnceWithExactly(catalog))
  })
})
