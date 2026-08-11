import type { KanwasDesktopBridge } from 'shared/local-api'

declare global {
  interface Window {
    kanwas?: KanwasDesktopBridge
  }
}

export function getDesktopBridge(): KanwasDesktopBridge | null {
  return window.kanwas ?? null
}

export function requireDesktopBridge(): KanwasDesktopBridge {
  const bridge = getDesktopBridge()
  if (!bridge) {
    throw new Error('This action is available in the Kanwas desktop app.')
  }
  return bridge
}
