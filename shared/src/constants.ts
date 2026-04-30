import type { CanvasItem } from './types.js'

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Sanitize a filename by removing/replacing problematic characters.
 * Must match the logic in converter.ts for consistency.
 *
 * Rejects values that resolve to path-traversal segments (`.`, `..`, `...`) or
 * are empty after sanitization, returning `'untitled'` instead. Callers
 * deduplicate via makeUniqueName so the constant is safe as a fallback.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .toLowerCase() // Enforce lower-kebab-case
    .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, '-') // Replace whitespace with dash
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, '') // Remove leading/trailing dashes
    .trim()
  if (sanitized === '' || /^\.+$/.test(sanitized)) return 'untitled'
  return sanitized
}

/**
 * Node layout constants for canvas positioning
 * Used by frontend, backend, and execenv for consistent node placement
 */
export const NODE_LAYOUT = {
  /** Default width for blockNote nodes */
  WIDTH: 720,
  /** Minimum height for nodes */
  MIN_HEIGHT: 144,
  /** Inner padding for node content */
  PADDING: 28,
  /** Default measured dimensions when creating new nodes */
  DEFAULT_MEASURED: { width: 720, height: 144 },
  /** Gap between items when placing */
  GAP: 60,
  /** Starting position for first item */
  INITIAL_POSITION: { x: 100, y: 100 },
} as const

/**
 * Collapsed node layout constants
 */
export const COLLAPSED_NODE_LAYOUT = {
  WIDTH: 268,
  // Full visible collapsed-node box, including the document-name row.
  HEIGHT: 126,
} as const

/**
 * Emoji-based color palette for collapsed cards.
 * Each entry maps an emoji to { bg, border, title } colors from Figma.
 */
export const EMOJI_PALETTE: Record<string, { bg: string; border: string; title: string }> = {
  '📝': { bg: '#EBE5D8', border: '#D9D0BE', title: '#6B5D45' },
  '💡': { bg: '#F0EACE', border: '#E2D9AD', title: '#6B6030' },
  '🎯': { bg: '#F5DBDB', border: '#E5BCBC', title: '#8B3A3A' },
  '🔥': { bg: '#E9DCCE', border: '#E5D3C2', title: '#694A2B' },
  '🧠': { bg: '#F6E5EB', border: '#E7CFD8', title: '#891D3C' },
  '✨': { bg: '#EDE5CE', border: '#DDD2B0', title: '#6B5A2E' },
  '📊': { bg: '#D5E3F0', border: '#B8CDE0', title: '#2E5478' },
  '🌿': { bg: '#D8E8D8', border: '#BDCFBD', title: '#3D6B3D' },
  '🔋': { bg: '#DCECCE', border: '#BFCDB1', title: '#485D32' },
  '🥶': { bg: '#DDDCEB', border: '#C1BFDD', title: '#443F78' },
  '👤': { bg: '#EBE5D8', border: '#D9D0BE', title: '#6B5D45' },
}

const PERSON_PALETTE = EMOJI_PALETTE['👤']
const DEFAULT_PALETTE = EMOJI_PALETTE['📝']

/**
 * Get colors for an emoji. Person emojis (👨, 👩, 👱‍♀️, 🧑, etc.)
 * all map to the warm beige palette. Falls back to 📝 colors.
 */
export function getEmojiColors(emoji: string): { bg: string; border: string; title: string } {
  if (EMOJI_PALETTE[emoji]) return EMOJI_PALETTE[emoji]
  // Detect person emojis: Unicode range U+1F464-1F9D9 covers people/faces
  const codePoint = emoji.codePointAt(0) ?? 0
  if (codePoint >= 0x1f464 && codePoint <= 0x1f9d9) return PERSON_PALETTE
  return DEFAULT_PALETTE
}

/**
 * Group layout constants for compact grid arrangement of collapsed nodes
 */
export const GROUP_LAYOUT = {
  COLUMNS: 2,
  /** Sentinel value: all members in a single row */
  HORIZONTAL_COLUMNS: 99,
  CELL_GAP: 12,
  PADDING: 16,
  LABEL_HEIGHT: 32,
  JOIN_INSET: 24,
} as const

/**
 * Canvas node layout constants for visual representation of canvases on parent
 */
export const CANVAS_NODE_LAYOUT = {
  WIDTH: 250,
  HEIGHT: 220,
} as const

// ============================================================================
// UNIFIED POSITION CALCULATION
// ============================================================================

export type PositionDirection = 'horizontal' | 'vertical'

export interface PositionOptions {
  direction: PositionDirection
  /** Width for horizontal, height for vertical */
  defaultSize: number
  gap?: number
  initialPosition?: { x: number; y: number }
}

/**
 * Unified position calculator for canvas items.
 * - horizontal: places items to the right of the rightmost existing item
 * - vertical: places items below the bottommost existing item
 */
export function calculateItemPosition(
  existingItems: Array<{
    xynode: {
      position: { x: number; y: number }
      measured?: { width?: number; height?: number }
    }
  }>,
  options: PositionOptions
): { x: number; y: number } {
  const gap = options.gap ?? NODE_LAYOUT.GAP
  const initial = options.initialPosition ?? NODE_LAYOUT.INITIAL_POSITION

  if (existingItems.length === 0) {
    return { ...initial }
  }

  if (options.direction === 'horizontal') {
    let maxRight = 0
    let yPosition = initial.y
    for (const item of existingItems) {
      const width = item.xynode.measured?.width ?? options.defaultSize
      const right = item.xynode.position.x + width
      if (right > maxRight) {
        maxRight = right
        yPosition = item.xynode.position.y
      }
    }
    return { x: maxRight + gap, y: yPosition }
  } else {
    let maxBottom = 0
    let xPosition = initial.x
    for (const item of existingItems) {
      const height = item.xynode.measured?.height ?? options.defaultSize
      const bottom = item.xynode.position.y + height
      if (bottom > maxBottom) {
        maxBottom = bottom
        xPosition = item.xynode.position.x
      }
    }
    return { x: xPosition, y: maxBottom + gap }
  }
}

/**
 * Recursively finds a canvas by ID in the canvas tree.
 */
export function findTargetCanvas(root: CanvasItem | null, canvasId?: string): CanvasItem | null {
  if (!root) return null
  if (!canvasId || root.id === canvasId) return root

  for (const item of root.items) {
    if (item.kind === 'canvas') {
      const found = findTargetCanvas(item, canvasId)
      if (found) return found
    }
  }
  return null
}

// ============================================================================
// IMAGE NODE CONSTANTS
// ============================================================================

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const
export type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number]

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

export const MIME_TO_EXTENSION: Record<string, SupportedImageExtension> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export const EXTENSION_TO_MIME: Record<SupportedImageExtension, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export const IMAGE_NODE_LAYOUT = {
  /** Default display width for image nodes (from Figma design) */
  WIDTH: 313,
  /** Minimum resize width */
  MIN_WIDTH: 100,
  /** Maximum resize width */
  MAX_WIDTH: 1200,
  MIN_HEIGHT: 100,
  MAX_DISPLAY_WIDTH: 800,
  MAX_DISPLAY_HEIGHT: 600,
  /** Default measured dimensions when creating new image nodes */
  DEFAULT_MEASURED: { width: 313, height: 235 },
} as const

export const NODE_NAME_HEIGHT = 28

/** MIME types accepted for image upload */
export const SUPPORTED_IMAGE_MIME_TYPES = Object.keys(MIME_TO_EXTENSION) as Array<keyof typeof MIME_TO_EXTENSION>

/**
 * Calculate full rendered dimensions for an image node given its natural dimensions.
 * Uses fixed width and includes the document-name row in the returned height.
 */
export function calculateImageDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number = IMAGE_NODE_LAYOUT.WIDTH
): { width: number; height: number } {
  const aspectRatio = naturalWidth / naturalHeight
  const height = displayWidth / aspectRatio + NODE_NAME_HEIGHT
  return { width: displayWidth, height: Math.round(height) }
}

/**
 * Check if an extension is a supported image extension
 */
export function isImageExtension(ext: string): ext is SupportedImageExtension {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext.toLowerCase() as SupportedImageExtension)
}

/**
 * Get the file extension from a mime type
 */
export function getExtensionFromMimeType(mimeType: string): SupportedImageExtension | undefined {
  return MIME_TO_EXTENSION[mimeType]
}

/**
 * Get the mime type from a file extension
 */
export function getMimeTypeFromExtension(ext: string): string | undefined {
  const lowerExt = ext.toLowerCase() as SupportedImageExtension
  return EXTENSION_TO_MIME[lowerExt]
}

// ============================================================================
// FILE NODE CONSTANTS
// ============================================================================

export const FILE_NODE_LAYOUT = {
  WIDTH: 220,
  HEIGHT: 180,
  DEFAULT_MEASURED: { width: 220, height: 180 },
} as const

// ============================================================================
// AUDIO NODE CONSTANTS
// ============================================================================

export const AUDIO_NODE_LAYOUT = {
  WIDTH: 400,
  HEIGHT: 83,
  DEFAULT_MEASURED: { width: 400, height: 83 },
} as const

// ============================================================================
// LINK NODE CONSTANTS
// ============================================================================

export const LINK_NODE_LAYOUT = {
  WIDTH: 313,
  HEIGHT: 282,
  DEFAULT_MEASURED: { width: 313, height: 282 },
} as const

export const LINK_IFRAME_LAYOUT = {
  WIDTH: 640,
  HEIGHT: 420,
  MIN_WIDTH: 320,
  MIN_HEIGHT: 220,
} as const

export const TEXT_NODE_LAYOUT = {
  WIDTH: 300,
  HEIGHT: 60,
  DEFAULT_MEASURED: { width: 300, height: 60 },
} as const

export const STICKY_NOTE_NODE_LAYOUT = {
  WIDTH: 240,
  HEIGHT: 240,
  DEFAULT_MEASURED: { width: 240, height: 240 },
} as const

/** Supported audio extensions (browser-playable) */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'ogg',
  'aac',
  'flac',
  'm4a',
  'opus',
  'webm', // Can be video or audio, treating as audio here
] as const

export type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number]

/**
 * Check if an extension is a supported audio extension
 */
export function isAudioExtension(ext: string): ext is SupportedAudioExtension {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext.toLowerCase() as SupportedAudioExtension)
}

/** Supported file extensions (non-image, non-audio binary files) */
export const SUPPORTED_FILE_EXTENSIONS = [
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  // Data formats
  'csv',
  'txt',
  'json',
  'xml',
  'yaml',
  'yml',
  // Video (audio moved to SUPPORTED_AUDIO_EXTENSIONS)
  'mp4',
  'mov',
  // Archives
  'zip',
  'tar',
  'gz',
] as const

export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number]

/**
 * Get Font Awesome icon class for a file type based on MIME type.
 * Uses FA6 solid icons.
 */
export function getFileTypeIcon(mimeType: string): string {
  // PDF
  if (mimeType.includes('pdf')) return 'fa-file-pdf'

  // Office documents
  if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'fa-file-excel'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'fa-file-powerpoint'

  // Media
  if (mimeType.includes('video')) return 'fa-file-video'
  if (mimeType.includes('audio')) return 'fa-file-audio'

  // Archives
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return 'fa-file-zipper'

  // Data formats
  if (mimeType.includes('csv')) return 'fa-file-csv'
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('yaml')) return 'fa-file-code'
  if (mimeType.includes('text/plain')) return 'fa-file-lines'

  // Default
  return 'fa-file'
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check if an extension is a supported file extension (non-image)
 */
export function isFileExtension(ext: string): ext is SupportedFileExtension {
  return SUPPORTED_FILE_EXTENSIONS.includes(ext.toLowerCase() as SupportedFileExtension)
}

/**
 * Map from file extension to icon filename (without .png extension)
 * Used by frontend to load PNG icons from assets/files/
 */
export const FILE_ICON_MAP: Record<string, string> = {
  // Documents
  pdf: 'pdf',
  doc: 'doc',
  docx: 'docx',
  xls: 'xls',
  xlsx: 'xlsx',
  ppt: 'ppt',
  pptx: 'pptx',
  // Data formats
  csv: 'csv',
  txt: 'txt',
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  // Video
  mp4: 'mp4',
  mov: 'mov',
  // Archives
  zip: 'zip',
  tar: 'tar',
  gz: 'gz',
}

/**
 * Get the icon name for a file based on its filename.
 * Returns the icon filename (without extension) to use from assets/files/
 */
export function getFileIconName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return FILE_ICON_MAP[ext] || 'txt' // fallback to txt icon
}
