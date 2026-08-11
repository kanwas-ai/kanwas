import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { LinkMetadataResponse } from 'shared/local-api'
import { fetch as undiciFetch } from 'undici'
import { sniffImage } from './image-sniff.js'
import { assertPublicHttpUrl, SsrfError, ssrfSafeDispatcher } from './ssrf-guard.js'
import type { UploadHandler } from './upload.js'

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export interface FetchLinkMetadataOptions {
  url: string
  canvasId: string
  upload: UploadHandler
  logger: Logger
}

function decodeHtml(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim()
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3])
}

function parseMetadata(html: string, pageUrl: string): LinkMetadataResponse & { imageUrl?: string } {
  const values = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attribute(match[0], 'property') ?? attribute(match[0], 'name'))?.toLowerCase()
    const content = attribute(match[0], 'content')
    if (key && content && !values.has(key)) values.set(key, content)
  }
  const title = values.get('og:title') ?? decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1])
  const faviconTag = [...html.matchAll(/<link\b[^>]*>/gi)].find((match) =>
    /(?:^|\s)(?:shortcut\s+)?icon(?:\s|$)/i.test(attribute(match[0], 'rel') ?? '')
  )
  const resolveUrl = (value: string | undefined): string | undefined => {
    if (!value) return undefined
    try {
      return assertPublicHttpUrl(new URL(value, pageUrl).toString()).toString()
    } catch {
      return undefined
    }
  }
  return {
    title,
    description: values.get('og:description') ?? values.get('description'),
    siteName: values.get('og:site_name'),
    favicon: resolveUrl(faviconTag ? attribute(faviconTag[0], 'href') : undefined),
    imageUrl: resolveUrl(values.get('og:image') ?? values.get('twitter:image')),
  }
}

async function readBody(response: Awaited<ReturnType<typeof undiciFetch>>, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('Response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Response exceeds size limit')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** Fetch a public URL while re-validating every redirect target before connecting. */
export async function fetchPublicUrl(
  rawUrl: string,
  timeoutMs: number,
  fetcher: typeof undiciFetch = undiciFetch
): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  let current = assertPublicHttpUrl(rawUrl)
  const signal = AbortSignal.timeout(timeoutMs)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(current, {
      dispatcher: ssrfSafeDispatcher,
      redirect: 'manual',
      signal,
    })
    const location = response.headers.get('location')
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response
    await response.body?.cancel().catch(() => undefined)
    if (redirects === MAX_REDIRECTS) throw new SsrfError('Too many redirects')
    try {
      current = assertPublicHttpUrl(new URL(location, current).toString())
    } catch (error) {
      if (error instanceof SsrfError) throw error
      throw new SsrfError('Invalid redirect URL')
    }
  }
  throw new SsrfError('Too many redirects')
}

export async function fetchLinkMetadata(options: FetchLinkMetadataOptions): Promise<LinkMetadataResponse> {
  const page = await fetchPublicUrl(options.url, 15_000)
  if (!page.ok) throw new Error(`Link returned HTTP ${page.status}`)
  const contentType = page.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) throw new Error('Link is not an HTML page')
  const parsed = parseMetadata((await readBody(page, MAX_HTML_BYTES)).toString('utf-8'), page.url)
  const { imageUrl, ...metadata } = parsed
  if (imageUrl) {
    const stored = await downloadImage(imageUrl, options)
    if (stored) metadata.imageStoragePath = stored
  }
  return metadata
}

async function downloadImage(imageUrl: string, options: FetchLinkMetadataOptions): Promise<string | null> {
  try {
    const response = await fetchPublicUrl(imageUrl, 10_000)
    if (!response.ok) return null
    const bytes = await readBody(response, MAX_IMAGE_BYTES)
    const image = sniffImage(bytes)
    if (!image) return null
    const uploaded = await options.upload({
      canvasId: options.canvasId,
      filename: `og-${randomUUID()}.${image.ext}`,
      buffer: bytes,
      mimeType: image.mime,
    })
    return uploaded.storagePath
  } catch (error) {
    options.logger.warn({ imageUrl, error: String(error) }, 'Could not store link preview image')
    return null
  }
}
