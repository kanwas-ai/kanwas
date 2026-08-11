/**
 * Compute SHA-256 hash of a File using the Web Crypto API.
 * Returns a 64-character hex string identical to Node.js crypto.createHash('sha256').digest('hex')
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
