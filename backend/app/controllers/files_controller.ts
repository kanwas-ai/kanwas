import type { HttpContext } from '@adonisjs/core/http'
import drive from '@adonisjs/drive/services/main'
import { basename } from 'node:path'
import mime from 'mime'
import { fileUploadValidator } from '#validators/file_upload'
import { moveMultipartFileToDisk } from '#services/multipart_file'
import { buildWorkspaceFileStoragePath } from '#services/workspace_file_storage'

/**
 * Response type for file uploads
 */
interface FileUploadResponse {
  storagePath: string
  mimeType: string
  size: number
  filename: string
  width?: number // For images
  height?: number // For images
}

function isDownloadRequested(downloadParam: unknown): boolean {
  return downloadParam === true || downloadParam === '1' || downloadParam === 'true'
}

function sanitizeDownloadFilename(filename: string): string {
  const cleaned = filename
    .replace(/[\r\n]/g, '')
    .replace(/["\\;]/g, '')
    .trim()

  if (!cleaned) {
    return 'download'
  }

  return cleaned
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function buildAttachmentContentDisposition(filename: string): string {
  const safeFilename = sanitizeDownloadFilename(filename)
  const asciiFallbackRaw = safeFilename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '_')
  const asciiFallback = asciiFallbackRaw.trim() || 'download'
  const encodedFilename = encodeRFC5987(safeFilename)

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`
}

/**
 * FilesController handles generic file uploads for workspaces.
 * Files are stored in a workspace-scoped path structure:
 *   files/{workspaceId}/{canvasId}/{filename}
 *
 * This endpoint is reusable for all file types (images, PDFs, CSVs, etc.)
 * The frontend enforces type-specific validation before upload.
 */
export default class FilesController {
  /**
   * Upload a file to workspace storage
   *
   * POST /workspaces/:id/files
   * Body: multipart/form-data with file, canvas_id, filename
   */
  async upload({ params, request, response }: HttpContext) {
    const workspaceId = params.id

    // Validate request
    const data = await request.validateUsing(fileUploadValidator)
    const file = data.file

    const storagePath = buildWorkspaceFileStoragePath(workspaceId, data.canvas_id, data.filename)

    // Store file using Drive (configured in config/drive.ts)
    await moveMultipartFileToDisk(file, storagePath)

    // Determine MIME type
    const mimeType = mime.getType(file.extname!) || 'application/octet-stream'

    // Build response
    const responseData: FileUploadResponse = {
      storagePath,
      mimeType,
      size: file.size,
      filename: data.filename,
    }

    // TODO: For images, optionally extract dimensions using sharp
    // if (mimeType.startsWith('image/')) {
    //   const dimensions = await getImageDimensions(storagePath)
    //   responseData.width = dimensions.width
    //   responseData.height = dimensions.height
    // }

    return response.ok(responseData)
  }

  /**
   * Get a signed URL for accessing a stored file
   *
   * GET /files/signed-url?path=...
   */
  async getSignedUrl({ request, response }: HttpContext) {
    const path = request.input('path')
    const download = request.input('download')
    const filenameInput = request.input('filename')

    if (typeof path !== 'string' || !path) {
      return response.badRequest({ error: 'Path parameter is required' })
    }

    try {
      const disk = drive.use()
      const shouldDownload = isDownloadRequested(download)

      const signedUrl = shouldDownload
        ? await disk.getSignedUrl(path, {
            contentDisposition: buildAttachmentContentDisposition(
              typeof filenameInput === 'string' && filenameInput.trim().length > 0 ? filenameInput : basename(path)
            ),
          })
        : await disk.getSignedUrl(path)

      return response.ok({ url: signedUrl })
    } catch {
      return response.badRequest({ error: 'Failed to generate signed URL' })
    }
  }
}
