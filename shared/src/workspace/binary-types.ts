/**
 * Binary file type mappings - browser-safe (no server dependencies).
 * Extracted from converter.ts to avoid pulling in @blocknote/server-util
 * when importing from the main shared entry point.
 */

export const BINARY_FILE_TYPES = {
  // Images
  png: { nodeType: 'image', mimeType: 'image/png' },
  jpg: { nodeType: 'image', mimeType: 'image/jpeg' },
  jpeg: { nodeType: 'image', mimeType: 'image/jpeg' },
  gif: { nodeType: 'image', mimeType: 'image/gif' },
  webp: { nodeType: 'image', mimeType: 'image/webp' },

  // Documents
  pdf: { nodeType: 'file', mimeType: 'application/pdf' },
  doc: { nodeType: 'file', mimeType: 'application/msword' },
  docx: { nodeType: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { nodeType: 'file', mimeType: 'application/vnd.ms-excel' },
  xlsx: { nodeType: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ppt: { nodeType: 'file', mimeType: 'application/vnd.ms-powerpoint' },
  pptx: { nodeType: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },

  // Data formats
  csv: { nodeType: 'file', mimeType: 'text/csv' },
  txt: { nodeType: 'file', mimeType: 'text/plain' },
  json: { nodeType: 'file', mimeType: 'application/json' },
  xml: { nodeType: 'file', mimeType: 'application/xml' },
  yaml: { nodeType: 'file', mimeType: 'application/x-yaml' },
  yml: { nodeType: 'file', mimeType: 'application/x-yaml' },

  // Video
  mp4: { nodeType: 'file', mimeType: 'video/mp4' },
  mov: { nodeType: 'file', mimeType: 'video/quicktime' },

  // Audio
  mp3: { nodeType: 'audio', mimeType: 'audio/mpeg' },
  wav: { nodeType: 'audio', mimeType: 'audio/wav' },
  ogg: { nodeType: 'audio', mimeType: 'audio/ogg' },
  aac: { nodeType: 'audio', mimeType: 'audio/aac' },
  flac: { nodeType: 'audio', mimeType: 'audio/flac' },
  m4a: { nodeType: 'audio', mimeType: 'audio/mp4' },
  opus: { nodeType: 'audio', mimeType: 'audio/opus' },
  webm: { nodeType: 'audio', mimeType: 'audio/webm' }, // Treating as audio

  // Archives
  zip: { nodeType: 'file', mimeType: 'application/zip' },
  tar: { nodeType: 'file', mimeType: 'application/x-tar' },
  gz: { nodeType: 'file', mimeType: 'application/gzip' },
} as const

export type BinaryFileExtension = keyof typeof BINARY_FILE_TYPES

export function getExtensionFromMimeType(mimeType: string): string | null {
  for (const [ext, info] of Object.entries(BINARY_FILE_TYPES)) {
    if (info.mimeType === mimeType) {
      return ext
    }
  }
  return null
}

export function isBinaryNodeType(nodeType: string): boolean {
  return nodeType === 'image' || nodeType === 'file' || nodeType === 'audio'
}
