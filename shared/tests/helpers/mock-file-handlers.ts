import type { FileUploader, FileReader, FileUploadResult } from '../../src/workspace/filesystem-syncer.js'

// Re-export no-op handlers from source
export { createNoOpFileUploader, createNoOpFileReader } from '../../src/workspace/filesystem-syncer.js'

// Re-export image buffer helper from source
export { createFakeImageBuffer } from '../../src/image-utils.js'

/**
 * Creates a mock FileUploader that tracks calls and returns predictable results.
 */
export function createMockFileUploader(options?: {
  /** Custom storage path prefix (default: 'files/test-workspace') */
  storagePathPrefix?: string
}) {
  const storagePathPrefix = options?.storagePathPrefix ?? 'files/test-workspace'

  const calls: Array<{
    buffer: Buffer
    canvasId: string
    filename: string
    mimeType: string
  }> = []

  const results: FileUploadResult[] = []

  const uploader: FileUploader = async (buffer, canvasId, filename, mimeType) => {
    calls.push({ buffer, canvasId, filename, mimeType })

    const result: FileUploadResult = {
      storagePath: `${storagePathPrefix}/${canvasId}/${filename}`,
      mimeType,
      size: buffer.length,
    }

    results.push(result)
    return result
  }

  return { uploader, calls, results }
}

/**
 * Creates a mock FileReader that returns buffers from a predefined map.
 */
export function createMockFileReader(files: Map<string, Buffer>) {
  const calls: string[] = []

  const reader: FileReader = async (absolutePath) => {
    calls.push(absolutePath)

    const buffer = files.get(absolutePath)
    if (!buffer) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    return buffer
  }

  return { reader, calls }
}

/**
 * Creates a FileUploader that always fails with the specified error.
 */
export function createFailingFileUploader(errorMessage: string): FileUploader {
  return async () => {
    throw new Error(errorMessage)
  }
}

/**
 * Creates a FileReader that always fails with the specified error.
 */
export function createFailingFileReader(errorMessage: string): FileReader {
  return async () => {
    throw new Error(errorMessage)
  }
}

/**
 * Helper to create a simple test buffer with readable content.
 */
export function createTestBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8')
}

// =============================================================================
// AUDIO BUFFER FACTORIES
// =============================================================================

/**
 * Creates a minimal valid MP3 buffer with ID3v2 header.
 * Size ~134 bytes (ID3 header + MP3 frame sync).
 */
export function createFakeMP3Buffer(): Buffer {
  // ID3v2 magic: 'ID3' + version (2.4) + flags + size (syncsafe integer)
  const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  // MP3 frame sync: 0xFF 0xFB (MPEG Audio Layer 3, 128kbps, 44.1kHz)
  const frameSync = Buffer.from([0xff, 0xfb, 0x90, 0x00])
  // Padding to make it look like real audio data
  const padding = Buffer.alloc(120)
  return Buffer.concat([id3Header, frameSync, padding])
}

/**
 * Creates a minimal valid WAV buffer with RIFF header.
 * Size ~44 bytes (minimal valid WAV with empty data chunk).
 */
export function createFakeWAVBuffer(): Buffer {
  const buffer = Buffer.alloc(44)

  // RIFF header
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36, 4) // File size - 8
  buffer.write('WAVE', 8, 'ascii')

  // fmt subchunk
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // Subchunk1 size (16 for PCM)
  buffer.writeUInt16LE(1, 20) // Audio format (1 = PCM)
  buffer.writeUInt16LE(1, 22) // Number of channels
  buffer.writeUInt32LE(44100, 24) // Sample rate
  buffer.writeUInt32LE(88200, 28) // Byte rate
  buffer.writeUInt16LE(2, 32) // Block align
  buffer.writeUInt16LE(16, 34) // Bits per sample

  // data subchunk (empty)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(0, 40) // Data size

  return buffer
}

/**
 * Creates a minimal OGG buffer with Ogg container magic.
 * Size ~35 bytes.
 */
export function createFakeOGGBuffer(): Buffer {
  // OGG magic: 'OggS' + version + header type + granule position + etc.
  const header = Buffer.from([
    0x4f,
    0x67,
    0x67,
    0x53, // 'OggS'
    0x00, // Version
    0x02, // Header type (BOS)
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // Granule position
    0x00,
    0x00,
    0x00,
    0x00, // Serial number
    0x00,
    0x00,
    0x00,
    0x00, // Page sequence
    0x00,
    0x00,
    0x00,
    0x00, // CRC (we're not computing a real one)
    0x01, // Number of segments
    0x00, // Segment table
  ])
  return Buffer.concat([header, Buffer.alloc(8)])
}

// =============================================================================
// DOCUMENT BUFFER FACTORIES
// =============================================================================

/**
 * Creates a minimal valid PDF buffer.
 * Size ~67 bytes.
 */
export function createFakePDFBuffer(): Buffer {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog >>
endobj
%%EOF
`
  return Buffer.from(content, 'ascii')
}

/**
 * Creates a CSV buffer with sample data.
 */
export function createFakeCSVBuffer(): Buffer {
  return Buffer.from('name,value\ntest,123\nfoo,456\n', 'utf-8')
}

/**
 * Creates a plain text buffer.
 */
export function createFakeTXTBuffer(content: string = 'Hello, world!'): Buffer {
  return Buffer.from(content, 'utf-8')
}
