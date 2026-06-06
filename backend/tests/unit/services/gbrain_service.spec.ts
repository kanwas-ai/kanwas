import { test } from '@japa/runner'
import GBrainService, {
  GBrainInvalidPathError,
  GBrainPageNotFoundError,
  type GBrainProvider,
} from '#services/gbrain_service'

const pages = [
  {
    path: 'concepts/kanwas-gbrain-mvp.md',
    title: 'Kanwas GBrain MVP',
    markdown: '# Kanwas GBrain MVP\n\nRead-only search and import keeps GBrain canonical.',
    sourceType: 'shared' as const,
    updatedAt: '2026-06-06T00:00:00.000Z',
  },
]

class ProbeProvider implements GBrainProvider {
  lastSearch: { query: string; limit: number } | null = null
  lastReadPath: string | null = null

  async search(query: string, limit: number) {
    this.lastSearch = { query, limit }
    return pages
      .filter((page) => `${page.title}\n${page.markdown}`.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map((page) => ({
        path: page.path,
        title: page.title,
        snippet: 'Read only search and import keeps GBrain canonical.',
        sourceType: page.sourceType,
        updatedAt: page.updatedAt,
        score: 1,
      }))
  }

  async readPage(path: string) {
    this.lastReadPath = path
    const page = pages.find((candidate) => candidate.path === path)
    if (!page) {
      throw new GBrainPageNotFoundError(path)
    }
    return page
  }
}

test.group('GBrainService', () => {
  test('trims queries, clamps limits, and returns sanitized search results', async ({ assert }) => {
    const provider = new ProbeProvider()
    const service = new GBrainService(provider)

    const results = await service.search({ query: '  gbrain  ', limit: 999 })

    assert.deepEqual(provider.lastSearch, { query: 'gbrain', limit: 20 })
    assert.lengthOf(results, 1)
    assert.deepEqual(results[0], {
      path: 'concepts/kanwas-gbrain-mvp.md',
      title: 'Kanwas GBrain MVP',
      snippet: 'Read only search and import keeps GBrain canonical.',
      sourceType: 'shared',
      updatedAt: '2026-06-06T00:00:00.000Z',
      score: 1,
    })
    assert.notInclude(JSON.stringify(results[0]), '/srv/hermes')
  })

  test('rejects empty search queries before provider access', async ({ assert }) => {
    const provider = new ProbeProvider()
    const service = new GBrainService(provider)

    const results = await service.search({ query: '   ', limit: 10 })

    assert.deepEqual(results, [])
    assert.isNull(provider.lastSearch)
  })

  test('reads a canonical page by normalized relative markdown path', async ({ assert }) => {
    const provider = new ProbeProvider()
    const service = new GBrainService(provider)

    const page = await service.readPage(' concepts/kanwas-gbrain-mvp.md ')

    assert.equal(provider.lastReadPath, 'concepts/kanwas-gbrain-mvp.md')
    assert.deepEqual(page, pages[0])
    assert.notInclude(JSON.stringify(page), '/srv/hermes')
  })

  test('rejects absolute and traversal paths without calling the provider', async ({ assert }) => {
    const provider = new ProbeProvider()
    const service = new GBrainService(provider)

    for (const pagePath of [
      '/srv/hermes/gbrain/shared/repo/index.md',
      '../private.md',
      'safe/../private.md',
      'notes\\x.md',
    ]) {
      const error = assert.throws(() => service.normalizePagePath(pagePath))
      assert.instanceOf(error, GBrainInvalidPathError)
    }

    assert.isNull(provider.lastReadPath)
  })
})
