// UI-specific constants (not shared across packages)
export const CANVAS = {
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 2,
  FIRST_OPEN_FIT_COMPACT_PADDING: 20,
  FIRST_OPEN_FIT_SMALL_CONTENT_MAX_ZOOM: 0.8,
  GRID_SIZE: 20,
  FIT_PADDING: 100,
  ANIMATION_DURATION: 400,
} as const

// Image node UI constraints (from Figma design) - different from IMAGE_NODE_LAYOUT in shared
export const IMAGE_NODE = {
  DEFAULT_WIDTH: 313,
  MIN_WIDTH: 100,
  MAX_WIDTH: 1200,
} as const

// Supported image types for upload validation
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
