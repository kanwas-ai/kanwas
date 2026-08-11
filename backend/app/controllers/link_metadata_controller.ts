import type { HttpContext } from '@adonisjs/core/http'
import drive from '@adonisjs/drive/services/main'
import ogs from 'open-graph-scraper'
import { fetch as undiciFetch } from 'undici'
import { linkMetadataValidator } from '#validators/link_metadata'
import { SsrfError, assertPublicHttpUrl, ssrfSafeDispatcher } from '#services/ssrf_guard'
import { sniffImage } from '#services/image_sniff'

interface LinkMetadataResponse {
  title?: string
  description?: string
  siteName?: string
  imageStoragePath?: string
  favicon?: string
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

export default class LinkMetadataController {
  async fetch({ request, response }: HttpContext) {
    const data = await request.validateUsing(linkMetadataValidator)

    try {
      assertPublicHttpUrl(data.url)
    } catch (error) {
      if (error instanceof SsrfError) {
        return response.badRequest({ error: error.message })
      }
      throw error
    }

    try {
      // ogs uses undici.fetch internally and passes fetchOptions through.
      // Cast via `any` because ogs types RequestInit against @types/node's
      // bundled undici-types (6.x), not the undici 7.x Dispatcher we produce.
      const { result } = await ogs({
        url: data.url,
        fetchOptions: { dispatcher: ssrfSafeDispatcher } as any,
      })

      const responseData: LinkMetadataResponse = {
        title: result.ogTitle,
        description: result.ogDescription,
        siteName: result.ogSiteName,
        favicon: result.favicon,
      }

      const imageUrl = result.ogImage?.[0]?.url
      if (imageUrl) {
        const stored = await downloadAndStoreOgImage(imageUrl, data.workspaceId, data.canvasId)
        if (stored) responseData.imageStoragePath = stored
      }

      return response.ok(responseData)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[LinkMetadataController] Failed to fetch OG metadata for ${data.url}:`, message)
      return response.badRequest({ error: 'Failed to fetch metadata' })
    }
  }
}

async function downloadAndStoreOgImage(
  imageUrl: string,
  workspaceId: string,
  canvasId: string
): Promise<string | null> {
  try {
    assertPublicHttpUrl(imageUrl)
  } catch (error) {
    console.warn(
      `[LinkMetadataController] Rejected OG image URL (${imageUrl}):`,
      error instanceof Error ? error.message : String(error)
    )
    return null
  }

  try {
    const imageResponse = await undiciFetch(imageUrl, {
      dispatcher: ssrfSafeDispatcher,
      signal: AbortSignal.timeout(10_000),
    })
    if (!imageResponse.ok) return null

    // Cap download size to prevent DoS via huge bodies
    const reader = imageResponse.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel()
        console.warn(`[LinkMetadataController] OG image exceeded ${MAX_IMAGE_BYTES} bytes: ${imageUrl}`)
        return null
      }
      chunks.push(value)
    }
    const imageBuffer = Buffer.concat(chunks)

    // Magic-byte check on the buffer we actually downloaded. The response
    // Content-Type header is attacker-controlled: a page can claim image/png
    // and serve SVG (XSS vector once served back from our origin), HTML,
    // or arbitrary bytes. We ignore the header and trust only the bytes.
    // SVG is intentionally rejected - it is XML and can carry <script>.
    const sniffed = sniffImage(imageBuffer)
    if (!sniffed) {
      console.warn(`[LinkMetadataController] OG image failed magic-byte check: ${imageUrl}`)
      return null
    }

    const filename = `og-${crypto.randomUUID()}.${sniffed.ext}`
    const storagePath = `files/${workspaceId}/${canvasId}/${filename}`
    // Force the stored Content-Type so R2 serves with the type we chose,
    // not whatever the origin claimed. Prevents MIME confusion on fetch.
    await drive.use().put(storagePath, imageBuffer, { contentType: sniffed.mime })
    return storagePath
  } catch (error) {
    console.warn(
      `[LinkMetadataController] Failed to fetch OG image ${imageUrl}:`,
      error instanceof Error ? error.message : String(error)
    )
    return null
  }
}
