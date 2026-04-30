import { test } from '@japa/runner'
import sinon from 'sinon'
import cache from '@adonisjs/cache/services/main'
import ConnectionsCatalogRefreshRequested from '#events/connections_catalog_refresh_requested'
import ConnectionsCatalogCacheService, {
  CONNECTIONS_CATALOG_CACHE_TTL_MS,
  CONNECTIONS_CATALOG_CACHE_KEY,
  CONNECTIONS_CATALOG_FRESHNESS_MS,
} from '#services/connections_catalog_cache_service'
import type { ConnectionStatus } from '#services/composio_service'

test.group('ConnectionsCatalogCacheService', (group) => {
  group.each.teardown(() => {
    sinon.restore()
  })

  test('loads and caches catalog on cache miss', async ({ assert }) => {
    const service = new ConnectionsCatalogCacheService()

    const getStub = sinon.stub(cache, 'get').resolves(null)
    const setStub = sinon.stub(cache, 'set').resolves(undefined)
    const dispatchStub = sinon.stub(ConnectionsCatalogRefreshRequested, 'dispatch').resolves()

    const loader = sinon.stub().resolves([
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        description: 'Connect GitHub repositories and issues.',
        categories: [{ slug: 'developer-tools', name: 'Developer Tools' }],
        isConnected: true,
        connectedAccountId: 'ca_123',
        connectedAccountStatus: 'ACTIVE',
        authConfigId: 'ac_123',
        authMode: 'use_custom_auth',
        isComposioManaged: false,
        isNoAuth: false,
      },
      {
        toolkit: 'hackernews',
        displayName: 'Hacker News',
        logo: 'https://logos.composio.dev/api/hackernews',
        isConnected: true,
        isNoAuth: true,
      },
    ] satisfies ConnectionStatus[])

    const result = await service.getCatalog(loader)

    assert.isTrue(getStub.calledOnceWithExactly({ key: CONNECTIONS_CATALOG_CACHE_KEY }))
    assert.isTrue(loader.calledOnce)
    assert.isTrue(dispatchStub.notCalled)
    assert.isTrue(setStub.calledOnce)

    assert.deepEqual(result, [
      {
        toolkit: 'github',
        displayName: 'GitHub',
        logo: 'https://logos.composio.dev/api/github',
        description: 'Connect GitHub repositories and issues.',
        categories: [{ slug: 'developer-tools', name: 'Developer Tools' }],
        isConnected: false,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: false,
      },
      {
        toolkit: 'hackernews',
        displayName: 'Hacker News',
        logo: 'https://logos.composio.dev/api/hackernews',
        isConnected: true,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
        authConfigId: undefined,
        authMode: undefined,
        isComposioManaged: undefined,
        isNoAuth: true,
      },
    ])

    const [setArgs] = setStub.firstCall.args as [{ key: string; value: unknown; ttl?: number }]
    const payload = setArgs.value as { cachedAt: number; entries: ConnectionStatus[] }

    assert.equal(setArgs.key, CONNECTIONS_CATALOG_CACHE_KEY)
    assert.equal(setArgs.ttl, CONNECTIONS_CATALOG_CACHE_TTL_MS)
    assert.equal(payload.entries.length, 2)
    assert.isNumber(payload.cachedAt)
    assert.equal(payload.entries[0]?.connectedAccountId, undefined)
    assert.equal(payload.entries[0]?.isConnected, false)
    assert.equal(payload.entries[0]?.description, 'Connect GitHub repositories and issues.')
    assert.deepEqual(payload.entries[0]?.categories, [{ slug: 'developer-tools', name: 'Developer Tools' }])
  })

  test('returns fresh cache without loading or refreshing', async ({ assert }) => {
    const now = Date.now()
    const clock = sinon.useFakeTimers({ now })

    try {
      const service = new ConnectionsCatalogCacheService()

      const cachedPayload = {
        cachedAt: now,
        entries: [
          {
            toolkit: 'github',
            displayName: 'GitHub',
            logo: 'https://logos.composio.dev/api/github',
            isConnected: false,
            isNoAuth: false,
          },
        ],
      }

      const getStub = sinon.stub(cache, 'get').resolves(cachedPayload)
      const loader = sinon.stub().resolves([])
      const dispatchStub = sinon.stub(ConnectionsCatalogRefreshRequested, 'dispatch').resolves()

      const result = await service.getCatalog(loader)

      assert.isTrue(getStub.calledOnceWithExactly({ key: CONNECTIONS_CATALOG_CACHE_KEY }))
      assert.isTrue(loader.notCalled)
      assert.isTrue(dispatchStub.notCalled)
      assert.deepEqual(result, [
        {
          toolkit: 'github',
          displayName: 'GitHub',
          logo: 'https://logos.composio.dev/api/github',
          isConnected: false,
          connectedAccountId: undefined,
          connectedAccountStatus: undefined,
          authConfigId: undefined,
          authMode: undefined,
          isComposioManaged: undefined,
          isNoAuth: false,
        },
      ])
    } finally {
      clock.restore()
    }
  })

  test('returns stale cache and dispatches background refresh', async ({ assert }) => {
    const now = Date.now()
    const clock = sinon.useFakeTimers({ now })

    try {
      const service = new ConnectionsCatalogCacheService()

      const cachedPayload = {
        cachedAt: now - CONNECTIONS_CATALOG_FRESHNESS_MS - 1,
        entries: [
          {
            toolkit: 'hackernews',
            displayName: 'Hacker News',
            logo: 'https://logos.composio.dev/api/hackernews',
            isConnected: true,
            connectedAccountId: 'ca_old',
            isNoAuth: true,
          },
        ],
      }

      sinon.stub(cache, 'get').resolves(JSON.stringify(cachedPayload))
      const loader = sinon.stub().resolves([])
      const dispatchStub = sinon.stub(ConnectionsCatalogRefreshRequested, 'dispatch').resolves()

      const result = await service.getCatalog(loader)

      assert.isTrue(loader.notCalled)
      assert.isTrue(dispatchStub.calledOnceWithExactly('stale'))
      assert.deepEqual(result, [
        {
          toolkit: 'hackernews',
          displayName: 'Hacker News',
          logo: 'https://logos.composio.dev/api/hackernews',
          isConnected: true,
          connectedAccountId: undefined,
          connectedAccountStatus: undefined,
          authConfigId: undefined,
          authMode: undefined,
          isComposioManaged: undefined,
          isNoAuth: true,
        },
      ])
    } finally {
      clock.restore()
    }
  })
})
