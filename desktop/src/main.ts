import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { startLocalRuntime, type LocalRuntimeHandle } from '@kanwas/local-runtime'

const QUIT_FLUSH_TIMEOUT_MS = 5_000
const PACKAGED_SMOKE_TEST = process.argv.includes('--kanwas-smoke-test')

interface StatusPayload {
  state: 'starting' | 'ready' | 'error'
  message: string
  showPicker: boolean
}

let mainWindow: BrowserWindow | null = null
let runtime: LocalRuntimeHandle | null = null
let latestStatus: StatusPayload | null = null
let quitInProgress = false
let quitAllowed = false

function emitStatus(payload: StatusPayload): void {
  latestStatus = payload
  mainWindow?.webContents.send('status', payload)
}

function rendererUrl(pathname = '/app'): string {
  if (!runtime) throw new Error('Local runtime has not started')
  return new URL(pathname, runtime.origin).toString()
}

function resourcePaths(): { rendererDir: string; templatesDir: string } {
  if (app.isPackaged) {
    return {
      rendererDir: path.join(process.resourcesPath, 'renderer'),
      templatesDir: path.join(process.resourcesPath, 'templates'),
    }
  }
  return {
    rendererDir: path.resolve(app.getAppPath(), '..', 'renderer', 'dist'),
    templatesDir: path.resolve(app.getAppPath(), '..', 'local-runtime', 'templates'),
  }
}

function isOwnedPage(rawUrl: string): boolean {
  if (!runtime) return rawUrl.startsWith('file:')
  try {
    const url = new URL(rawUrl)
    return url.origin === runtime.origin && (url.pathname === '/app' || url.pathname.startsWith('/app/'))
  } catch {
    return false
  }
}

function openExternal(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    // Runtime-owned pages and files carry powerful same-origin local API
    // access. Never hand them to a system browser, where active local content
    // could execute with that origin.
    if (runtime && url.origin === runtime.origin) return
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      void shell.openExternal(rawUrl)
    }
  } catch {
    // Ignore malformed external URLs.
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Kanwas',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    backgroundColor: '#282726',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  void win.loadFile(path.join(app.getAppPath(), 'ui', 'index.html'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isOwnedPage(url)) return
    event.preventDefault()
    openExternal(url)
  })
  win.on('close', (event) => {
    if (quitAllowed) return
    // Keep the renderer alive long enough to complete the bounded save
    // handshake. shutdown() calls app.quit() again after runtime cleanup, at
    // which point quitAllowed lets the native close proceed.
    event.preventDefault()
    void shutdown()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) throw new Error('Untrusted IPC sender')
}

function registerIpc(): void {
  ipcMain.on('ui-ready', (event) => {
    if (mainWindow && event.sender.id === mainWindow.webContents.id && latestStatus) {
      event.sender.send('status', latestStatus)
    }
  })

  ipcMain.handle('vault:list', (event) => {
    assertTrustedSender(event)
    return runtime?.listVaults() ?? []
  })
  ipcMain.handle('vault:open', async (event) => {
    assertTrustedSender(event)
    if (!runtime || !mainWindow) throw new Error('Kanwas is not ready')
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder to open as your Kanwas vault',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    return runtime.openVault(selection.filePaths[0])
  })
  ipcMain.handle('vault:activate', async (event, workspaceId: string) => {
    assertTrustedSender(event)
    if (!runtime) throw new Error('Kanwas is not ready')
    return runtime.activateVault(workspaceId)
  })
  ipcMain.handle('vault:rename', (event, workspaceId: string, label: string) => {
    assertTrustedSender(event)
    if (!runtime) throw new Error('Kanwas is not ready')
    return runtime.renameVaultLabel(workspaceId, label)
  })
  ipcMain.handle('vault:forget', async (event, workspaceId: string) => {
    assertTrustedSender(event)
    if (!runtime) throw new Error('Kanwas is not ready')
    await runtime.forgetVault(workspaceId)
  })
}

async function startApplication(): Promise<void> {
  mainWindow = createWindow()
  emitStatus({ state: 'starting', message: 'Starting Kanwas…', showPicker: false })
  const resources = resourcePaths()
  try {
    runtime = await startLocalRuntime({
      stateDir: app.getPath('userData'),
      logFile: path.join(app.getPath('logs'), 'local-runtime.log'),
      rendererDir: resources.rendererDir,
      templatesDir: resources.templatesDir,
    })
    const active = runtime.getActiveVault()
    emitStatus({ state: 'ready', message: 'Kanwas is ready.', showPicker: false })
    await mainWindow.loadURL(rendererUrl(active ? `/app/w/${active.urlId}` : '/app'))
    if (PACKAGED_SMOKE_TEST) {
      console.log('Kanwas packaged-app smoke test passed.')
      await shutdown()
    }
  } catch (error) {
    emitStatus({
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
      showPicker: false,
    })
    if (PACKAGED_SMOKE_TEST) {
      console.error('Kanwas packaged-app smoke test failed.', error)
      process.exitCode = 1
      await shutdown()
    }
  }
}

async function waitForRendererFlush(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed() || !isOwnedPage(mainWindow.webContents.getURL())) return
  const window = mainWindow
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, QUIT_FLUSH_TIMEOUT_MS)
    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender.id === window.webContents.id) finish()
    }
    function finish() {
      clearTimeout(timer)
      ipcMain.off('renderer-ready-to-quit', onReady)
      resolve()
    }
    ipcMain.on('renderer-ready-to-quit', onReady)
    window.webContents.send('prepare-to-quit')
  })
}

async function shutdown(): Promise<void> {
  if (quitInProgress) return
  quitInProgress = true
  try {
    if (!PACKAGED_SMOKE_TEST) await waitForRendererFlush()
    await runtime?.flushAll().catch(() => undefined)
    await runtime?.close()
    runtime = null
  } finally {
    quitAllowed = true
    app.quit()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('before-quit', (event) => {
    if (quitAllowed) return
    event.preventDefault()
    void shutdown()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('activate', () => {
    if (mainWindow) mainWindow.show()
    else void startApplication()
  })
  app.whenReady().then(() => {
    registerIpc()
    return startApplication()
  })
}
