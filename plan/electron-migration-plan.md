# Electron Migration Plan (Tauri → Electron)

Written 2026-07-21 on the `local-first` branch. Replaces the Tauri v2 desktop
shell in `desktop/` with an Electron shell, and removes the WebKit-specific
workarounds from the frontend (Electron is Chromium — the engine the app was
built against and where it always performed well).

**Why this is easy:** the Tauri shell is deliberately thin
(`desktop/src-tauri/src/main.rs`, ~370 lines). It has no app logic — it probes
for a running `kanwasd`, resolves a vault folder, spawns
`node local-daemon/dist/cli.js up --no-open <folder>`, then navigates its
webview to `http://127.0.0.1:4300/local-login`. The Kanwas frontend is a stock
web app with zero Tauri awareness. All of that ports 1:1 into an Electron main
process — in Node, which is _less_ code than the Rust version (native `fetch`
replaces `ureq`, `dialog.showOpenDialog` replaces the dialog plugin,
`child_process.spawn` replaces `Command`).

**Read `desktop/src-tauri/src/main.rs` and `desktop/ui/index.html` BEFORE
deleting anything** — they are the reference implementation being ported, and
`desktop/` is currently untracked (never committed), so deleted means gone.

---

## Work packages

WP-1 (Electron shell) and WP-2 (frontend cleanup) are independent — run them
as two parallel agents. WP-3 (docs) follows both.

---

## WP-1: Build the Electron shell, remove the Tauri one

### Target layout

```
desktop/
  package.json          # rewritten for Electron
  .gitignore            # node_modules/, dist/, out/
  README.md             # rewritten (WP-3, but same agent may do it)
  src/
    main.ts             # port of src-tauri/src/main.rs
    preload.ts          # tiny contextBridge for the loading page
  ui/
    index.html          # existing loading page, IPC calls swapped
  build/
    icon.icns           # moved from src-tauri/icons/icon.icns
    icon.png            # moved from src-tauri/icons/icon.png
```

Delete `desktop/src-tauri/` entirely (after moving the two icons) — Cargo
files, capabilities, the rest of the icons, `main.rs`, `tauri.conf.json`.

### package.json

```jsonc
{
  "name": "desktop",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "bundle": "esbuild src/main.ts src/preload.ts --bundle --platform=node --external:electron --outdir=dist",
    "dev": "pnpm bundle && electron .",
    "build": "pnpm bundle && electron-builder --mac",
  },
  "devDependencies": {
    "electron": "<latest stable major>",
    "electron-builder": "^26",
    "esbuild": "^0.25",
  },
  "build": {
    "appId": "ai.kanwas.desktop",
    "productName": "Kanwas",
    "files": ["dist/**", "ui/**"],
    "mac": {
      "target": "dir",
      "icon": "build/icon.icns",
      "identity": null,
    },
  },
}
```

Notes:

- No runtime dependencies at all. `esbuild` bundles the two TS files to CJS in
  `dist/` (repo has no `"type": "module"` at desktop level, so `.js` output is
  CJS — matches `"main": "dist/main.js"`).
- `"target": "dir"` = plain `Kanwas.app`, no DMG, matching the Tauri
  `"targets": ["app"]`. `"identity": null` skips code signing for now.
- **pnpm 10 blocks postinstall scripts by default.** Electron's postinstall
  downloads its binary. Add to the ROOT `package.json` under the existing
  `"pnpm"` key: `"onlyBuiltDependencies": ["electron"]`, then `pnpm install`.
  If `electron` fails to fetch its binary anyway, `pnpm rebuild electron`.
- `pnpm-workspace.yaml` already lists `desktop` — no change.

### src/main.ts — port of main.rs, piece by piece

Port the behavior of `main.rs` exactly. Constants: `DAEMON_EMAIL =
'local@kanwas.local'`, ready-poll timeout 30 s / interval 300 ms, probe
timeout 1500 ms, default port 4300 (`KANWAS_PORT` override).

**Window creation** (on `app.whenReady()`):

```ts
new BrowserWindow({
  width: 1440,
  height: 900,
  title: 'Kanwas',
  titleBarStyle: 'hiddenInset', // = Tauri "Overlay" + hiddenTitle
  backgroundColor: '#282726',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})
```

Load the loading page with `win.loadFile('ui/index.html')` (path relative to
`app.getAppPath()`), then kick off the bootstrap.

**Bootstrap flow** — same state machine as `run_bootstrap()` in main.rs:

1. Guard against concurrent runs with a simple `bootstrapping` boolean
   (replaces the `AtomicBool`).
2. Unless `forcePicker`: emit status `probing`, probe the daemon. If alive →
   navigate to login and stop.
   - Probe: `fetch('http://127.0.0.1:${port}/auth/me', { signal:
AbortSignal.timeout(1500) })`, parse JSON, true iff `body.email ===
'local@kanwas.local'`. Any error → false.
3. Resolve the folder: most recently opened entry in
   `${KANWAS_HOME || ~/.kanwas}/vaults.json` whose `path` still exists
   (`vaults[].{path, lastOpenedAt}`, ISO-8601 strings — plain string-compare
   max, as in Rust). If none (or `forcePicker`): emit `picking` status, then
   `dialog.showOpenDialog(win, { title: 'Choose a folder to open as your
Kanwas vault', properties: ['openDirectory', 'createDirectory'] })`.
   Cancelled → emit `error` status with `showPicker: true` and the same
   message as main.rs.
4. Resolve the `node` binary — **keep spawning system Node, do NOT use
   `ELECTRON_RUN_AS_NODE` with `process.execPath`**: the daemon loads
   `node-pty` (native module) built for the system-Node ABI; Electron's
   bundled Node has a different `NODE_MODULE_VERSION` and the module would
   fail to load. Port `resolve_node()` as-is: `KANWAS_NODE` env if it exists →
   `execFile('/bin/zsh', ['-lc', 'command -v node'])` → fallback paths
   `/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`. None
   found → `error` status "Node.js not found — install Node or set
   KANWAS_NODE".
5. Resolve repo root: `KANWAS_REPO` env, else `path.resolve(app.getAppPath(),
'..')` (desktop/ → repo root — same dev-tether the Tauri build had via
   `CARGO_MANIFEST_DIR`). Launcher is
   `<repo>/local-daemon/dist/cli.js`; if missing, `error` status telling the
   user to run `pnpm --filter local-daemon build`.
6. Emit `starting` status ("Starting the Kanwas daemon… (first run builds the
   web bundle, ~1 min)"), then spawn and wait:
   `execFile(nodePath, [launcher, 'up', '--no-open', folder])` (no shell —
   folder names with spaces/quotes must not be reinterpreted). The CLI
   daemonizes and exits. Non-zero exit → `error` status with the last 15
   lines of combined stdout+stderr and the `~/.kanwas/daemon.log` hint,
   `showPicker: true`. Spawn failure itself → `error` with the message.
7. Poll the probe every 300 ms for up to 30 s. Ready → navigate; timeout →
   `error` status pointing at `~/.kanwas/daemon.log`.
8. Navigate: emit `ready` status, then
   `win.loadURL('http://127.0.0.1:${port}/local-login')` (the login shim sets
   the auth token on its own origin and redirects into the canvas).

**IPC with the loading page** (replaces Tauri events; names can stay
kanwas-flavored but go through `ipcMain`):

- `ipcMain.on('ui-ready')` → reply with the last buffered status (keep the
  buffer-and-replay pattern: bootstrap may emit before the page's listener
  attaches).
- `ipcMain.on('pick-folder')` → re-run bootstrap with `forcePicker: true`.
- Status pushes: `win.webContents.send('status', { state, message,
showPicker })`. Only the loading page listens; once navigated to the
  daemon origin these are ignored — harmless.

**Drag region on the daemon-served app** — the frontend has no drag-region
markup and can't be modified for the shell. Replace Tauri's injected
WKUserScript with:

```ts
win.webContents.on('did-finish-load', () => {
  const url = new URL(win.webContents.getURL())
  if (url.protocol === 'http:' && url.hostname === '127.0.0.1') {
    win.webContents.executeJavaScript(DRAG_REGION_JS)
  }
})
```

where `DRAG_REGION_JS` inserts (idempotently, guarded by element id
`__kanwas_drag_region`) a `position:fixed; top:0; left:0; right:0;
height:24px; z-index:2147483647; app-region:drag; -webkit-app-region:drag`
div. In Electron the CSS property alone gives dragging AND double-click
maximize — no IPC needed (much simpler than the Tauri version).

**External links:** add
`win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url);
return { action: 'deny' } })` and a `will-navigate` handler that allows the
daemon origin (`http://127.0.0.1:*`) and the bundled `file:` page but sends
anything else to `shell.openExternal`. (The Tauri shell silently swallowed
these; this is a small behavior improvement — canvas LinkNodes open in the
default browser.)

**Lifecycle:** `app.on('window-all-closed', () => app.quit())` — plain quit,
no dock lingering. Quitting must leave the daemon running (it may serve
browser tabs); nothing special needed since the daemon is a detached process.
Keep Electron's default application menu (it provides Cmd+C/V/X/Z/Q on
macOS — removing it silently breaks copy/paste).

### src/preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('kanwas', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, payload) => cb(payload)),
  uiReady: () => ipcRenderer.send('ui-ready'),
  pickFolder: () => ipcRenderer.send('pick-folder'),
})
```

The preload also runs on the daemon-served pages after navigation; the
frontend ignores `window.kanwas` — harmless.

### ui/index.html

Keep the page byte-for-byte except:

- The `<script>` block: replace `window.__TAURI__.event`'s `listen`/`emit`
  with `window.kanwas.onStatus(applyStatus)`, `window.kanwas.uiReady()`, and
  `window.kanwas.pickFolder()`. Same status payload shape
  (`{ state, message, showPicker }`), same replay handshake.
- `.titlebar-drag-region`: drop the `data-tauri-drag-region` attribute, add
  `app-region: drag; -webkit-app-region: drag;` to its CSS rule.

### Verification (manual, macOS)

Prereqs: `pnpm --filter local-daemon build`, root `pnpm install` after the
`onlyBuiltDependencies` change.

1. Daemon already running → `pnpm --filter desktop dev` navigates straight to
   the canvas (brief loading flash is fine).
2. `kanwas down`, registry has a valid vault → shell starts the daemon and
   lands in the canvas within ~30 s.
3. `KANWAS_HOME=$(mktemp -d) pnpm --filter desktop dev` with no running
   daemon → native folder picker appears; cancelling shows the error panel
   with the "Choose Folder…" retry button; the button re-opens the picker.
4. `KANWAS_REPO=/nonexistent` → readable error about the launcher path.
5. Window drags by the top strip on both the loading page and the canvas;
   double-click on the strip maximizes; traffic lights render over the app.
6. Quit the app → `curl http://127.0.0.1:4300/auth/me` still answers.
7. `pnpm --filter desktop build` → `desktop/dist/mac*/Kanwas.app` (path per
   electron-builder output) launches. Note: unsigned + dev-tethered
   (`KANWAS_REPO`/repo-relative), same as the Tauri build was.

---

## WP-2: Remove the WebKit workarounds from the frontend

Context: `plan/tauri-canvas-perf-research.md` documents workarounds for
WKWebView's compositor (blur during/after zoom, slow repaints). Electron is
Chromium; none of the WebKit-specific ones are needed. All of them are
uncommitted working-tree changes vs HEAD, which makes reverting surgical.

**One deliberate KEEP: `frontend/src/components/canvas/useViewportCulling.ts`.**
It is not a WebKit workaround — it hides offscreen node wrappers so they
don't rasterize, an engine-agnostic win (tldraw does the same in Chromium).
Without it every BlockNote editor on a large canvas paints even when
offscreen, in the browser app too. It has zero visual effect. Keep the file
and its call in `CanvasFlowSurface.tsx`. (If the user later wants it gone
too: delete the file, the import, and the `useViewportCulling(...)` call.)

Per-file actions:

1. **Delete** `frontend/src/lib/engine.ts` (`isWebKitNotBlink`).
2. **Delete** `frontend/src/components/canvas/useCrispViewport.ts` (toggled
   `will-change` + viewport-rounding hack for WebKit bug #27684).
3. `frontend/src/main.tsx` — `git restore` it: the only working-tree change
   is the `isWebKitNotBlink()` / `engine-webkit` class block. Verify with
   `git diff frontend/src/main.tsx` first (must show only that block).
4. `frontend/src/components/canvas/CanvasFlowSurface.tsx` — remove the
   `useCrispViewport` import, the `const { onMoveStart, onMoveEnd } = ...`
   line, and the `onMoveStart={onMoveStart}` / `onMoveEnd={onMoveEnd}` props
   on `<XYReactFlow>`. KEEP the `useViewportCulling` import and call.
5. `frontend/src/index.css` — `git restore` it after verifying
   `git diff frontend/src/index.css` shows only these WebKit hunks (it did as
   of 2026-07-21):
   - `.nodrag` `user-select: text` change (reverts to `user-select: all`)
   - `body { font-synthesis: none }`
   - `.engine-webkit .workspace-interlink-toolbar` (backdrop-filter kill)
   - `.engine-webkit [class*='backdrop-blur']`
   - `.engine-webkit .canvas-toolbar-pill` (+ `.dark` variant)
   - `.engine-webkit .react-flow__viewport *` (will-change reset)
   - `.engine-webkit` / `.engine-webkit.dark` `--card-shadow` overrides
     If other (non-WebKit) edits have landed in the file by execution time,
     remove only the hunks above instead of restoring wholesale.
6. Grep check: `grep -rn "engine-webkit\|isWebKitNotBlink\|useCrispViewport"
frontend/src` must return nothing.
7. `plan/tauri-canvas-perf-research.md` — prepend a status line: desktop
   shell moved to Electron (Chromium) on 2026-07-21; WebKit workarounds
   removed; viewport culling kept as a general optimization. Keep the doc
   (it documents why Tauri/WKWebView was abandoned — history worth keeping).

Verification: `pnpm --filter frontend build` (or `tsc --noEmit` + vite build)
passes; in the running app (browser or Electron shell) `<html>` never gets an
`engine-webkit` class, canvas zoom/pan stays crisp, toolbar pill still shows
its backdrop blur.

---

## WP-3: Docs

- `desktop/README.md` — rewrite for Electron: same four-step launch
  description (probe → folder → spawn daemon → navigate), dev/build
  commands, env overrides (`KANWAS_PORT`, `KANWAS_REPO`, `KANWAS_NODE`
  all still honored), prereqs now "Node ≥ 20" only (no Rust toolchain),
  same quit-leaves-daemon note.
- `local-daemon/README.md:392` — change the "**Tauri / MCP** desktop
  packaging" bullet to say Electron.
- Do NOT touch `plan/local-first-*.md` history docs beyond what WP-2 step 7
  says.

---

## Risks / gotchas (for the executing agents)

- **`desktop/` is untracked.** The Tauri implementation exists nowhere but
  the working tree. The user should commit the current state before WP-1
  deletes `src-tauri/`. Do not commit on the user's behalf.
- **node-pty ABI**: never run the daemon via `ELECTRON_RUN_AS_NODE` (see
  WP-1 step 4).
- **pnpm 10 script blocking**: without `onlyBuiltDependencies: ["electron"]`
  in the root package.json, Electron installs without its binary and
  `electron .` fails with "Electron failed to install correctly".
- **Unsigned app**: Gatekeeper may quarantine the built `.app` if it's ever
  distributed; fine for local use. Signing/notarization is Phase B.
- The Rust shell's status-buffering exists because bootstrap can emit before
  the page listens — the Electron port must keep the `ui-ready` replay or
  early errors render as an eternal spinner.

## Out of scope (Phase B, later)

A self-contained distributable: bundle `local-daemon/dist` + the built
frontend into app resources, run the daemon on Electron's own Node
(`ELECTRON_RUN_AS_NODE`) with `node-pty` rebuilt against the Electron ABI
(`@electron/rebuild`), then signing, notarization, DMG, auto-update. The
current plan reaches parity with the Tauri shell (dev-tethered to the repo
checkout), which is what exists today.
