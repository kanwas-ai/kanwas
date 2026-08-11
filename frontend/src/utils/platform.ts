/** True when running inside the Kanwas Electron shell on macOS, where
 * hiddenInset traffic lights and a 24px drag strip overlay the top-left. */
export function isDesktopMac(): boolean {
  return navigator.userAgent.includes('Electron') && navigator.userAgent.includes('Macintosh')
}
