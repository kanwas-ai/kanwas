import { imageSize } from 'image-size'
import { PNG } from 'pngjs'

/**
 * Get image dimensions from a buffer (for Node.js/execenv use only).
 * This function uses image-size which requires Node.js Buffer APIs.
 */
export function getImageDimensionsFromBuffer(buffer: Buffer): { width: number; height: number } | null {
  try {
    const result = imageSize(buffer)
    if (result.width && result.height) {
      return { width: result.width, height: result.height }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Creates a valid PNG buffer with specified dimensions for testing.
 * Uses pngjs to generate a proper PNG structure that passes validation
 * and can be parsed by image-size.
 *
 * @param width - Image width (default: 100)
 * @param height - Image height (default: 75)
 */
export function createFakeImageBuffer(width: number = 100, height: number = 75): Buffer {
  const png = new PNG({ width, height })

  // Fill with red pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = 255 // R
      png.data[idx + 1] = 0 // G
      png.data[idx + 2] = 0 // B
      png.data[idx + 3] = 255 // A
    }
  }

  return PNG.sync.write(png)
}
