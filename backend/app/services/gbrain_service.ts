import fs from 'node:fs/promises'
import path from 'node:path'

export type GBrainSourceType = 'shared' | 'private' | 'fixture' | 'unknown'

export interface GBrainSearchResult {
  path: string
  title: string
  snippet: string
  score?: number
  sourceType?: GBrainSourceType
  updatedAt?: string
}

export interface GBrainPage {
  path: string
  title: string
  markdown: string
  sourceType?: GBrainSourceType
  updatedAt?: string
}

export interface GBrainProvider {
  search(query: string, limit: number): Promise<GBrainSearchResult[]>
  readPage(path: string): Promise<GBrainPage>
}

export interface GBrainSearchOptions {
  query: string
  limit?: number
}

export class GBrainInvalidPathError extends Error {
  constructor(pagePath: string) {
    super(`Invalid GBrain page path: ${pagePath}`)
    this.name = 'GBrainInvalidPathError'
  }
}

export class GBrainPageNotFoundError extends Error {
  constructor(pagePath: string) {
    super(`GBrain page not found: ${pagePath}`)
    this.name = 'GBrainPageNotFoundError'
  }
}

export class GBrainProviderUnavailableError extends Error {
  constructor() {
    super('No readable GBrain provider is configured')
    this.name = 'GBrainProviderUnavailableError'
  }
}

type SearchablePage = GBrainPage & { absolutePath?: string }

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
const MAX_MARKDOWN_BYTES = 512 * 1024
const MAX_SEARCH_FILES = 5_000
const DEFAULT_SHARED_ROOT = '/srv/hermes/gbrain/shared/repo'

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value ?? DEFAULT_LIMIT)))
}

function extractTitle(markdown: string, pagePath: string): string {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))

  if (heading) {
    return heading.replace(/^#\s+/, '').trim().slice(0, 160)
  }

  return path.posix.basename(pagePath, '.md')
}

function normalizeSnippet(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, (match) => match.replace(/\(([^)]*)\)/, ''))
    .replace(/[#>*_`|\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSnippet(markdown: string, query: string): string {
  const normalized = normalizeSnippet(markdown)
  if (!normalized) {
    return ''
  }

  const lower = normalized.toLowerCase()
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1)
  const firstIndex = words.map((word) => lower.indexOf(word)).find((index) => index >= 0) ?? 0
  const start = Math.max(0, firstIndex - 60)
  const end = Math.min(normalized.length, firstIndex + 180)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < normalized.length ? '…' : ''

  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`
}

function scorePage(page: GBrainPage, query: string): number {
  const haystack = `${page.title}\n${page.markdown}`.toLowerCase()
  const title = page.title.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  return words.reduce((score, word) => {
    if (!haystack.includes(word)) {
      return score
    }

    return score + (title.includes(word) ? 3 : 1)
  }, 0)
}

async function safeStatDirectory(root: string): Promise<boolean> {
  try {
    const stat = await fs.stat(root)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function readMarkdownLimited(filePath: string): Promise<{ markdown: string; updatedAt?: string }> {
  const stat = await fs.stat(filePath)
  if (!stat.isFile() || stat.size > MAX_MARKDOWN_BYTES) {
    throw new GBrainPageNotFoundError(filePath)
  }

  const markdown = await fs.readFile(filePath, 'utf8')
  return { markdown, updatedAt: stat.mtime.toISOString() }
}

async function* walkMarkdownFiles(root: string): AsyncGenerator<string> {
  const pending = [root]
  let visitedFiles = 0

  while (pending.length > 0 && visitedFiles < MAX_SEARCH_FILES) {
    const current = pending.pop()!
    let entries: Array<{ name: string; isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }>

    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isSymbolicLink()) {
        continue
      }

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          pending.push(absolutePath)
        }
        continue
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        visitedFiles += 1
        yield absolutePath
      }
    }
  }
}

function makeSafeJoin(root: string, pagePath: string): string {
  const absoluteRoot = path.resolve(root)
  const absolutePath = path.resolve(absoluteRoot, pagePath)
  const relative = path.relative(absoluteRoot, absolutePath)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GBrainInvalidPathError(pagePath)
  }

  return absolutePath
}

class FixtureGBrainProvider implements GBrainProvider {
  private readonly pages: GBrainPage[] = [
    {
      path: 'concepts/kanwas-gbrain-mvp.md',
      title: 'Kanwas GBrain MVP',
      markdown:
        '# Kanwas GBrain MVP\n\nThis fixture proves the read-only GBrain lens and Kanwas import path without exposing a canonical repository or write credentials.',
      sourceType: 'fixture',
    },
  ]

  async search(query: string, limit: number): Promise<GBrainSearchResult[]> {
    return this.pages
      .map((page) => ({ page, score: scorePage(page, query) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ page, score }) => ({
        path: page.path,
        title: page.title,
        snippet: buildSnippet(page.markdown, query),
        score,
        sourceType: page.sourceType,
        updatedAt: page.updatedAt,
      }))
  }

  async readPage(pagePath: string): Promise<GBrainPage> {
    const page = this.pages.find((candidate) => candidate.path === pagePath)
    if (!page) {
      throw new GBrainPageNotFoundError(pagePath)
    }

    return page
  }
}

class FilesystemGBrainProvider implements GBrainProvider {
  constructor(private readonly roots: Array<{ root: string; sourceType: GBrainSourceType }>) {}

  async search(query: string, limit: number): Promise<GBrainSearchResult[]> {
    const pages: Array<{ page: SearchablePage; score: number }> = []
    let hasReadableRoot = false

    for (const rootConfig of this.roots) {
      if (!(await safeStatDirectory(rootConfig.root))) {
        continue
      }
      hasReadableRoot = true

      for await (const absolutePath of walkMarkdownFiles(rootConfig.root)) {
        const relativePath = toPosixPath(path.relative(rootConfig.root, absolutePath))
        let normalizedPath: string

        try {
          normalizedPath = GBrainService.normalizePagePathValue(relativePath)
        } catch {
          continue
        }

        try {
          const { markdown, updatedAt } = await readMarkdownLimited(absolutePath)
          const page: SearchablePage = {
            path: normalizedPath,
            title: extractTitle(markdown, normalizedPath),
            markdown,
            sourceType: rootConfig.sourceType,
            updatedAt,
            absolutePath,
          }
          const score = scorePage(page, query)
          if (score > 0) {
            pages.push({ page, score })
          }
        } catch {
          continue
        }
      }
    }

    if (!hasReadableRoot) {
      throw new GBrainProviderUnavailableError()
    }

    return pages
      .sort((left, right) => right.score - left.score || left.page.path.localeCompare(right.page.path))
      .slice(0, limit)
      .map(({ page, score }) => ({
        path: page.path,
        title: page.title,
        snippet: buildSnippet(page.markdown, query),
        score,
        sourceType: page.sourceType,
        updatedAt: page.updatedAt,
      }))
  }

  async readPage(pagePath: string): Promise<GBrainPage> {
    let hasReadableRoot = false

    for (const rootConfig of this.roots) {
      if (!(await safeStatDirectory(rootConfig.root))) {
        continue
      }
      hasReadableRoot = true

      const absolutePath = makeSafeJoin(rootConfig.root, pagePath)

      try {
        const { markdown, updatedAt } = await readMarkdownLimited(absolutePath)
        return {
          path: pagePath,
          title: extractTitle(markdown, pagePath),
          markdown,
          sourceType: rootConfig.sourceType,
          updatedAt,
        }
      } catch {
        // Try the next configured root.
      }
    }

    if (!hasReadableRoot) {
      throw new GBrainProviderUnavailableError()
    }

    throw new GBrainPageNotFoundError(pagePath)
  }
}

class FallbackGBrainProvider implements GBrainProvider {
  constructor(
    private readonly primary: GBrainProvider,
    private readonly fallback: GBrainProvider
  ) {}

  async search(query: string, limit: number): Promise<GBrainSearchResult[]> {
    try {
      return await this.primary.search(query, limit)
    } catch (error) {
      if (error instanceof GBrainProviderUnavailableError) {
        return this.fallback.search(query, limit)
      }

      throw error
    }
  }

  async readPage(pagePath: string): Promise<GBrainPage> {
    try {
      return await this.primary.readPage(pagePath)
    } catch (error) {
      if (error instanceof GBrainProviderUnavailableError) {
        return this.fallback.readPage(pagePath)
      }

      throw error
    }
  }
}

function buildDefaultProvider(): GBrainProvider {
  const roots: Array<{ root: string; sourceType: GBrainSourceType }> = []
  const sharedRoot = process.env.GBRAIN_SHARED_ROOT?.trim() || DEFAULT_SHARED_ROOT
  const privateRoot = process.env.GBRAIN_PRIVATE_ROOT?.trim()

  if (sharedRoot) {
    roots.push({ root: sharedRoot, sourceType: 'shared' })
  }
  if (privateRoot) {
    roots.push({ root: privateRoot, sourceType: 'private' })
  }

  return new FallbackGBrainProvider(new FilesystemGBrainProvider(roots), new FixtureGBrainProvider())
}

export default class GBrainService {
  constructor(private readonly provider: GBrainProvider = buildDefaultProvider()) {}

  static normalizePagePathValue(pagePath: string): string {
    const trimmed = pagePath.trim()
    if (!trimmed || trimmed.includes('\\') || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
      throw new GBrainInvalidPathError(pagePath)
    }

    const normalized = path.posix.normalize(trimmed)
    if (
      normalized !== trimmed ||
      normalized === '.' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized.startsWith('/') ||
      !normalized.endsWith('.md')
    ) {
      throw new GBrainInvalidPathError(pagePath)
    }

    return normalized
  }

  normalizePagePath(pagePath: string): string {
    return GBrainService.normalizePagePathValue(pagePath)
  }

  async search(options: GBrainSearchOptions): Promise<GBrainSearchResult[]> {
    const query = options.query.trim()
    if (!query) {
      return []
    }

    const limit = clampLimit(options.limit)
    const results = await this.provider.search(query, limit)

    return results
      .map((result) => ({
        path: this.normalizePagePath(result.path),
        title: result.title.trim() || extractTitle('', result.path),
        snippet: normalizeSnippet(result.snippet).slice(0, 500),
        sourceType: result.sourceType ?? 'unknown',
        updatedAt: result.updatedAt,
        score: result.score,
      }))
      .slice(0, limit)
  }

  async readPage(pagePath: string): Promise<GBrainPage> {
    const normalizedPath = this.normalizePagePath(pagePath)
    const page = await this.provider.readPage(normalizedPath)

    return {
      path: this.normalizePagePath(page.path),
      title: page.title.trim() || extractTitle(page.markdown, normalizedPath),
      markdown: page.markdown,
      sourceType: page.sourceType ?? 'unknown',
      updatedAt: page.updatedAt,
    }
  }
}
