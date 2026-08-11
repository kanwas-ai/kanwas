import { getDesktopBridge } from '@/lib/desktop'

/** True when the Kanwas Electron shell reports macOS. */
export function isDesktopMac(): boolean {
  return getDesktopBridge()?.platform === 'darwin'
}

/** Platform-aware shortcut labels also work during standalone renderer development. */
export function isMacPlatform(): boolean {
  return getDesktopBridge()?.platform === 'darwin' || navigator.platform.includes('Mac')
}
