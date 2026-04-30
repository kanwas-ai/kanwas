// Magic-byte sniffer for server-side image ingestion.
//
// We deliberately do NOT decode pixels (no sharp / imagemagick / jimp) to
// avoid inheriting zero-days in image-parsing libraries. We only read a
// short prefix and match against known container signatures.
//
// Supported: PNG, JPEG, GIF, WebP. SVG is intentionally not supported —
// it is XML and can carry <script>, which becomes stored XSS once served
// back to browsers from our origin.

export interface SniffedImage {
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  ext: 'png' | 'jpg' | 'gif' | 'webp'
}

export function sniffImage(buffer: Uint8Array): SniffedImage | null {
  if (buffer.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' }
  }

  // WebP: "RIFF" ???? "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }

  return null
}
