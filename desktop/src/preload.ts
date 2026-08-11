import { contextBridge, ipcRenderer } from 'electron'
import type { KanwasDesktopBridge, VaultSummary, WorkspaceSummary } from 'shared/local-api'

interface StatusPayload {
  state: 'starting' | 'ready' | 'error'
  message: string
  showPicker: boolean
}

const bridge: KanwasDesktopBridge & {
  onStatus(callback: (payload: StatusPayload) => void): () => void
  uiReady(): void
} = {
  platform: process.platform as KanwasDesktopBridge['platform'],
  listVaults: () => ipcRenderer.invoke('vault:list') as Promise<VaultSummary[]>,
  openVault: () => ipcRenderer.invoke('vault:open') as Promise<WorkspaceSummary | null>,
  activateVault: (workspaceId) => ipcRenderer.invoke('vault:activate', workspaceId) as Promise<WorkspaceSummary>,
  renameVaultLabel: (workspaceId, label) =>
    ipcRenderer.invoke('vault:rename', workspaceId, label) as Promise<WorkspaceSummary>,
  forgetVault: (workspaceId) => ipcRenderer.invoke('vault:forget', workspaceId) as Promise<void>,
  onPrepareToQuit(callback) {
    const listener = () => callback()
    ipcRenderer.on('prepare-to-quit', listener)
    return () => ipcRenderer.off('prepare-to-quit', listener)
  },
  readyToQuit: () => ipcRenderer.send('renderer-ready-to-quit'),
  onStatus(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: StatusPayload) => callback(payload)
    ipcRenderer.on('status', listener)
    return () => ipcRenderer.off('status', listener)
  },
  uiReady: () => ipcRenderer.send('ui-ready'),
}

contextBridge.exposeInMainWorld('kanwas', bridge)
