/**
 * Utility functions for converting between standard UUID format (with hyphens)
 * and URL-friendly format (without hyphens)
 */

/**
 * Removes hyphens from a UUID for use in URLs
 * @example "8d12b25e-20af-40ab-b372-30eade2d59b3" -> "8d12b25e20af40abb37230eade2d59b3"
 */
export function toUrlUuid(uuid: string): string {
  return uuid.replace(/-/g, '')
}

/**
 * Adds hyphens back to a URL UUID for use in API calls
 * @example "8d12b25e20af40abb37230eade2d59b3" -> "8d12b25e-20af-40ab-b372-30eade2d59b3"
 */
export function fromUrlUuid(urlUuid: string): string {
  // If already has hyphens, return as-is
  if (urlUuid.includes('-')) {
    return urlUuid
  }

  // Insert hyphens at proper positions for UUID format
  // xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${urlUuid.slice(0, 8)}-${urlUuid.slice(8, 12)}-${urlUuid.slice(12, 16)}-${urlUuid.slice(16, 20)}-${urlUuid.slice(20)}`
}
