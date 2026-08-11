// The Kanwas desktop shell is deliberately thin: the window starts on a
// bundled loading page (`../ui/index.html`), a bootstrap run makes sure
// `kanwasd` is up, then the window is navigated into the real app served by
// the daemon. IPC here is only for the loading page (status pushes + folder
// picker) — the Kanwas frontend itself is a stock web app with no awareness
// it's running inside Electron.
//
// Ported from the Tauri v2 shell (`desktop/src-tauri/src/main.rs`) — same
// states, same user-facing messages, same timeouts.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readFileSync, realpathSync } from 'fs'
import { homedir } from 'os'
import * as path from 'path'

// Injected by `build.mjs` via esbuild's `define` — the absolute path of the
// repo checkout the bundle was built from. See the doc comment above
// `resolveRepoRoot` for why this is needed alongside the dev-relative path.
declare const __KANWAS_DEV_REPO__: string

const DAEMON_EMAIL = 'local@kanwas.local'
const READY_POLL_TIMEOUT_MS = 30_000
const READY_POLL_INTERVAL_MS = 300
const PROBE_TIMEOUT_MS = 1500
const DEFAULT_PORT = 4300

// titleBarStyle: "hiddenInset" leaves the daemon-served frontend undraggable
// — it's a stock web app with no drag-region markup, and its source can't be
// modified from here. This strip stands in for one, mirroring what
// `ui/index.html` already does for the bundled loading page. In Electron the
// `app-region: drag` CSS property alone gives dragging AND double-click
// maximize — no IPC round-trip needed (simpler than the Tauri version, which
// had to inject a WKUserScript that called back into Rust to start the drag).
const DRAG_REGION_JS = `(() => {
  if (document.getElementById('__kanwas_drag_region')) return;
  const strip = document.createElement('div');
  strip.id = '__kanwas_drag_region';
  strip.style.cssText =
    'position:fixed;top:0;left:0;right:0;height:24px;z-index:2147483647;background:transparent;app-region:drag;-webkit-app-region:drag;';
  document.documentElement.appendChild(strip);
})();`

interface StatusPayload {
  state: 'probing' | 'picking' | 'starting' | 'ready' | 'error'
  message: string
  showPicker: boolean
}

/** Guards against two bootstrap runs racing (e.g. a stray second "pick
 * folder" retry) and buffers the latest status so it can be replayed to the
 * loading page once its listener attaches (`ui-ready`), since a bootstrap run
 * may emit before that happens. */
const appState = {
  bootstrapping: false,
  lastStatus: null as StatusPayload | null,
}

let mainWindow: BrowserWindow | null = null

function emitStatus(win: BrowserWindow, state: StatusPayload['state'], message: string, showPicker: boolean): void {
  const payload: StatusPayload = { state, message, showPicker }
  appState.lastStatus = payload
  win.webContents.send('status', payload)
}

/** Kick off a bootstrap run unless one is already in flight. `forcePicker`
 * skips the vault registry and goes straight to the folder dialog (used for
 * `pick-folder` retries). JS is single-threaded, so setting the flag
 * synchronously before the first `await` is enough to prevent a race — no
 * atomic/CAS needed like the Rust version. */
function spawnBootstrap(win: BrowserWindow, forcePicker: boolean): void {
  if (appState.bootstrapping) return
  appState.bootstrapping = true
  runBootstrap(win, forcePicker).finally(() => {
    appState.bootstrapping = false
  })
}

async function runBootstrap(win: BrowserWindow, forcePicker: boolean): Promise<void> {
  const port = resolvePort()

  if (!forcePicker) {
    emitStatus(win, 'probing', 'Looking for a running Kanwas daemon…', false)
    if (await probeDaemon(port)) {
      navigateToLogin(win, port)
      return
    }
  }

  const folder = await resolveFolder(win, forcePicker)
  if (!folder) {
    emitStatus(win, 'error', 'No folder selected — choose a folder to open as your Kanwas vault.', true)
    return
  }

  const node = await resolveNode()
  if (!node) {
    emitStatus(win, 'error', 'Node.js not found — install Node or set KANWAS_NODE', false)
    return
  }

  let repoRoot: string
  try {
    repoRoot = resolveRepoRoot()
  } catch (error) {
    emitStatus(win, 'error', (error as Error).message, false)
    return
  }

  const launcher = path.join(repoRoot, 'local-daemon', 'dist', 'cli.js')
  if (!existsSync(launcher)) {
    emitStatus(win, 'error', `Launcher not found at ${launcher}. Run \`pnpm --filter local-daemon build\`.`, false)
    return
  }

  emitStatus(win, 'starting', 'Starting the Kanwas daemon… (first run builds the web bundle, ~1 min)', false)

  // No shell — args are passed directly, so an odd folder name (spaces,
  // quotes, …) can't reinterpret the command line.
  try {
    const result = await execFileAsync(node, [launcher, 'up', '--no-open', folder])
    if (result.code !== 0) {
      const tail = lastLines(combinedOutput(result.stdout, result.stderr), 15)
      emitStatus(win, 'error', `Failed to start the Kanwas daemon:\n${tail}\n\nFull log: ~/.kanwas/daemon.log`, true)
      return
    }
  } catch (error) {
    emitStatus(win, 'error', `Failed to launch the daemon process: ${(error as Error).message}`, true)
    return
  }

  const deadline = Date.now() + READY_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await probeDaemon(port)) {
      navigateToLogin(win, port)
      return
    }
    await sleep(READY_POLL_INTERVAL_MS)
  }

  emitStatus(win, 'error', 'Kanwas daemon did not become ready in time. See ~/.kanwas/daemon.log.', false)
}

function resolvePort(): number {
  const raw = process.env.KANWAS_PORT
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT
}

/** `GET /auth/me` answers with the local-user email iff the listener on
 * `port` is a kanwasd (vs. some unrelated process or nothing at all). */
async function probeDaemon(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const body = (await response.json()) as { email?: unknown }
    return body?.email === DAEMON_EMAIL
  } catch {
    return false
  }
}

function navigateToLogin(win: BrowserWindow, port: number): void {
  emitStatus(win, 'ready', 'Kanwas is ready.', false)
  win.loadURL(`http://127.0.0.1:${port}/local-login`).catch((error: Error) => {
    emitStatus(win, 'error', `Failed to open Kanwas: ${error.message}`, false)
  })
}

/** The vault to open: the most recently opened registry entry that still
 * exists on disk, or (when none qualify, or a retry explicitly asks for it) a
 * native folder picker. */
async function resolveFolder(win: BrowserWindow, forcePicker: boolean): Promise<string | null> {
  if (!forcePicker) {
    const existing = newestValidVault()
    if (existing) return existing
  }
  emitStatus(win, 'picking', 'Choose a folder to open as your Kanwas vault…', false)
  return showFolderPicker(win)
}

interface VaultEntry {
  path: string
  lastOpenedAt: string
}

function newestValidVault(): string | null {
  let raw: string
  try {
    raw = readFileSync(vaultsFile(), 'utf8')
  } catch {
    return null
  }

  let registry: { vaults?: VaultEntry[] }
  try {
    registry = JSON.parse(raw)
  } catch {
    return null
  }

  let best: VaultEntry | null = null
  for (const vault of registry.vaults ?? []) {
    if (!existsSync(vault.path)) continue
    // ISO-8601 "Z" timestamps sort lexicographically in the same order as
    // chronologically, so a plain string compare avoids a date-parsing dep.
    if (!best || vault.lastOpenedAt > best.lastOpenedAt) best = vault
  }
  return best ? best.path : null
}

function vaultsFile(): string {
  return path.join(kanwasHome(), 'vaults.json')
}

function kanwasHome(): string {
  if (process.env.KANWAS_HOME) return process.env.KANWAS_HOME
  return path.join(homedir(), '.kanwas')
}

async function showFolderPicker(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a folder to open as your Kanwas vault',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Resolve the `node` binary — keep spawning system Node, do NOT use
 * `ELECTRON_RUN_AS_NODE` with `process.execPath`: the daemon loads
 * `node-pty` (a native module) built for the system-Node ABI. Electron's
 * bundled Node has a different `NODE_MODULE_VERSION`, so the module would
 * fail to load if we spawned the daemon with Electron's own Node. */
async function resolveNode(): Promise<string | null> {
  const envNode = process.env.KANWAS_NODE
  if (envNode && existsSync(envNode)) return envNode

  try {
    const result = await execFileAsync('/bin/zsh', ['-lc', 'command -v node'])
    if (result.code === 0) {
      const found = result.stdout.trim()
      if (found && existsSync(found)) return found
    }
  } catch {
    // /bin/zsh itself failed to spawn — fall through to the fixed candidate
    // paths below.
  }

  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** `<repo>/desktop` → `<repo>`. Resolution order: `$KANWAS_REPO` (explicit
 * override, e.g. for dev setups where the daemon lives outside this
 * checkout) wins unconditionally when set; otherwise the first of
 * `app.getAppPath()`'s parent (works in dev, where `app.getAppPath()` is the
 * `desktop/` checkout) or `__KANWAS_DEV_REPO__` (the repo root baked in at
 * bundle time by `build.mjs`, which is what makes a packaged `.app` on the
 * dev machine work — in a packaged app `app.getAppPath()` resolves inside
 * the bundle's `Resources/app.asar`, which never contains the daemon) that
 * actually contains the built launcher. This mirrors the Tauri build's
 * `CARGO_MANIFEST_DIR`-relative resolution, minus the compile-time guarantee
 * — Electron's bundler doesn't run at a fixed location the way `cargo build`
 * does, so both candidates are checked at runtime instead of picking one. */
function resolveRepoRoot(): string {
  const envRepo = process.env.KANWAS_REPO
  if (envRepo) {
    try {
      return realpathSync(envRepo)
    } catch (error) {
      throw new Error(`Could not resolve the Kanwas repo root at ${envRepo}: ${(error as Error).message}`)
    }
  }

  const candidates = [path.resolve(app.getAppPath(), '..'), __KANWAS_DEV_REPO__]
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'local-daemon', 'dist', 'cli.js'))) {
      return realpathSync(candidate)
    }
  }

  throw new Error(
    `Could not find the local-daemon launcher relative to either candidate repo root ` +
      `(${candidates.join(' or ')}). Run \`pnpm --filter local-daemon build\`, or set $KANWAS_REPO.`
  )
}

interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

/** Promisified `execFile` that distinguishes "process never started" (bad
 * path, permissions, …) from "process started and exited non-zero" — Node
 * folds both into the callback's `error` argument, but only the former
 * should be treated as a hard failure to spawn. */
function execFileAsync(file: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    // 16 MB, not the 1 MB default — exceeding maxBuffer KILLS the child, and
    // the daemon's first `up` run emits a full web-bundle build log.
    execFile(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (error as unknown as { code?: number | string }).code : 0
      if (error && typeof code !== 'number') {
        reject(error)
        return
      }
      resolve({ code: typeof code === 'number' ? code : 0, stdout, stderr })
    })
  })
}

/** Not true fd-level interleaving (Node can't easily merge two pipes like a
 * shell's `2>&1`) — good enough for a human-readable error tail, which is
 * all this is used for. */
function combinedOutput(stdout: string, stderr: string): string {
  const out = stdout.trim()
  const err = stderr.trim()
  if (!out && !err) return ''
  if (out && !err) return out
  if (!out && err) return err
  return `${out}\n${err}`
}

function lastLines(text: string, n: number): string {
  const lines = text.split('\n')
  const start = Math.max(0, lines.length - n)
  return lines.slice(start).join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The bundled loading page runs on the `file:` scheme; only the daemon
 * (plain http on 127.0.0.1, port varies with `KANWAS_PORT`) needs the drag
 * strip. */
function isDaemonOrigin(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Kanwas',
    // "hiddenInset" = Tauri's titleBarStyle "Overlay" + hiddenTitle: true —
    // traffic lights drawn over the content, no native title bar.
    titleBarStyle: 'hiddenInset',
    // Matches the app icon background (#282726) so the window never flashes
    // white before the loading page (or the daemon-served app) paints.
    backgroundColor: '#282726',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Relative to app.getAppPath() — the desktop/ checkout in dev, the
  // packaged resources dir once built (both ship `ui/**`, see package.json).
  win.loadFile('ui/index.html')

  win.webContents.on('did-finish-load', () => {
    if (isDaemonOrigin(win.webContents.getURL())) {
      win.webContents.executeJavaScript(DRAG_REGION_JS).catch(() => {})
    }
  })

  // The Tauri shell silently swallowed external links; this is a small
  // behavior improvement — canvas LinkNodes open in the default browser
  // instead of navigating the app window away from Kanwas.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isDaemonOrigin(url) || url.startsWith('file:')) return
    event.preventDefault()
    shell.openExternal(url)
  })

  return win
}

// Replay the latest buffered status once the loading page's listener
// attaches — a bootstrap run may otherwise emit before anyone is listening,
// which would otherwise render as an eternal spinner on an early error.
ipcMain.on('ui-ready', (event) => {
  if (appState.lastStatus) event.sender.send('status', appState.lastStatus)
})

ipcMain.on('pick-folder', () => {
  if (mainWindow) spawnBootstrap(mainWindow, true)
})

// Plain quit, no dock lingering. Quitting must leave the daemon running (it
// may still be serving browser tabs) — nothing special needed since the
// daemon is a detached process the CLI launcher hands off to.
app.on('window-all-closed', () => {
  app.quit()
})

app.whenReady().then(() => {
  mainWindow = createWindow()
  spawnBootstrap(mainWindow, false)
})
