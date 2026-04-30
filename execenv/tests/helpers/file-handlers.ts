/**
 * Real file handler implementations for integration tests.
 *
 * These handlers actually call the backend API and filesystem,
 * unlike the no-op mocks used for unit tests.
 */

import fs from 'fs/promises'
import { PNG } from 'pngjs'
import { initializeApiClient, uploadFile, fetchFileBinary } from '../../src/api.js'
import type { FileUploader, FileReader } from 'shared/server'
import type { TestEnvironment } from './setup.js'

/**
 * Creates a valid minimal PNG buffer for testing using pngjs.
 * AdonisJS validates file content, not just extensions, so we need a real PNG structure.
 *
 * @param size - Minimum buffer size (PNG will be padded if needed)
 */
export function createFakeImageBuffer(size: number = 1024): Buffer {
  // Create 1x1 red PNG
  const png = new PNG({ width: 1, height: 1 })

  // Set RGBA for the single pixel (red)
  png.data[0] = 255 // R
  png.data[1] = 0 // G
  png.data[2] = 0 // B
  png.data[3] = 255 // A

  const pngBuffer = PNG.sync.write(png)

  // Pad if caller requested larger size
  // (PNG parsers ignore data after IEND)
  if (size > pngBuffer.length) {
    const padding = Buffer.alloc(size - pngBuffer.length)
    return Buffer.concat([pngBuffer, padding])
  }

  return pngBuffer
}

/**
 * Initialize API client with test environment credentials.
 * Must be called before using createRealFileUploader or createRealFileFetcher.
 */
export function initializeApiForTests(testEnv: TestEnvironment): void {
  initializeApiClient({
    backendUrl: testEnv.backendUrl,
    authToken: testEnv.authToken,
  })
}

/**
 * Creates a FileUploader that actually uploads to the backend.
 * Used for FS → yDoc sync when images are created in the filesystem.
 */
export function createRealFileUploader(workspaceId: string): FileUploader {
  return async (buffer, canvasId, filename, mimeType) => {
    return uploadFile(workspaceId, buffer, canvasId, filename, mimeType)
  }
}

/**
 * Creates a FileReader that reads from the actual filesystem.
 * Used for FS → yDoc sync to read binary file content before upload.
 *
 * @param workspacePath - The base workspace path to resolve relative paths against
 */
export function createRealFileReader(workspacePath: string): FileReader {
  return async (relativePath) => {
    const fullPath = `${workspacePath}/${relativePath}`
    return fs.readFile(fullPath)
  }
}

/**
 * Creates a FileFetcher for workspaceToFilesystem that downloads real binaries.
 * Used for yDoc → FS sync to download images from backend storage.
 */
export function createRealFileFetcher(): (storagePath: string) => Promise<Buffer> {
  return (storagePath) => fetchFileBinary(storagePath)
}

// =============================================================================
// AUDIO BUFFER FACTORIES
// =============================================================================

/**
 * Creates a minimal valid MP3 buffer with ID3v2 header.
 * Size ~134 bytes (ID3 header + MP3 frame sync).
 */
export function createFakeMP3Buffer(size: number = 134): Buffer {
  // ID3v2 magic: 'ID3' + version (2.4) + flags + size (syncsafe integer)
  const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  // MP3 frame sync: 0xFF 0xFB (MPEG Audio Layer 3, 128kbps, 44.1kHz)
  const frameSync = Buffer.from([0xff, 0xfb, 0x90, 0x00])
  // Padding to make it look like real audio data
  const basePadding = Buffer.alloc(120)
  const baseBuffer = Buffer.concat([id3Header, frameSync, basePadding])

  // Pad if caller requested larger size
  if (size > baseBuffer.length) {
    const extraPadding = Buffer.alloc(size - baseBuffer.length)
    return Buffer.concat([baseBuffer, extraPadding])
  }

  return baseBuffer
}

// =============================================================================
// DOCUMENT BUFFER FACTORIES
// =============================================================================

/**
 * Creates a minimal valid PDF buffer.
 * Size ~67 bytes.
 */
export function createFakePDFBuffer(size: number = 67): Buffer {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog >>
endobj
%%EOF
`
  const baseBuffer = Buffer.from(content, 'ascii')

  // Pad if caller requested larger size
  // (PDF readers stop at %%EOF, extra bytes are ignored)
  if (size > baseBuffer.length) {
    const padding = Buffer.alloc(size - baseBuffer.length)
    return Buffer.concat([baseBuffer, padding])
  }

  return baseBuffer
}
