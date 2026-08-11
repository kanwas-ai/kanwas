// Tiny contextBridge for the bundled loading page (`ui/index.html`). This
// preload also runs on the daemon-served pages after navigation — the
// Kanwas frontend just ignores `window.kanwas`, harmless.

import { contextBridge, ipcRenderer } from 'electron'

interface StatusPayload {
  state: 'probing' | 'picking' | 'starting' | 'ready' | 'error'
  message: string
  showPicker: boolean
}

contextBridge.exposeInMainWorld('kanwas', {
  onStatus: (callback: (payload: StatusPayload) => void) =>
    ipcRenderer.on('status', (_event, payload: StatusPayload) => callback(payload)),
  uiReady: () => ipcRenderer.send('ui-ready'),
  pickFolder: () => ipcRenderer.send('pick-folder'),
})
