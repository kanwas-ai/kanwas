#!/usr/bin/env node
// `kanwas` — the local-first launcher. One command turns any folder into a live
// Kanwas canvas in the browser. Since Phase 3, kanwasd is genuinely multi-folder:
// ONE daemon process can serve MANY mounted folders, tracked in a persistent
// registry (`~/.kanwas/vaults.json`).
//
//   kanwas up [folder]     mount a folder — starts kanwasd if nothing's running,
//                          or registers with the already-running daemon (no restart)
//   kanwas ls              list every folder Kanwas knows about (mounted + registered)
//   kanwas rm <folder|id>  unmount + forget a folder (never touches its contents)
//   kanwas status          show what's running (pid, ports, every mounted vault)
//   kanwas down            stop the daemon (unmounts every folder)
//
// It is a thin wrapper: kanwasd (dist/index.js) does the real work. `up` builds
// the frontend bundle on first use, then either spawns the daemon detached or
// calls its REST API to add another folder, and opens the `/local-login` URL
// (which sets the auth token with zero console steps).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { LOCAL_AUTH_TOKEN_KEY, LOCAL_USER } from './identity.js'
import { pidAlive, readInstance, removeInstance, type DaemonInstance } from './instance.js'
import {
  DAEMON_LOG_FILE,
  FRONTEND_DIR,
  INSTANCE_FILE,
  KANWAS_HOME,
  KANWASUP_ENV_FILE,
  PACKAGE_ROOT,
  VAULTS_FILE,
  WEB_DIST_DIR,
} from './paths.js'
import { byRecency, loadRegistry, saveRegistry, touchVault, unregisterVault, type VaultEntry } from './vaults.js'

// One daemon, many folders — fixed ports (documented). Override via env for
// advanced use (also how the test suite runs a scratch daemon in parallel).
const REST_PORT = Number(process.env.KANWAS_PORT ?? 4300)
const YJS_PORT = Number(process.env.KANWAS_YJS_PORT ?? 1999)
const HOST = '127.0.0.1'
const DAEMON_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'index.js')
const READY_TIMEOUT_MS = 60_000
/** Mounting a fresh folder does real work (adoption, chokidar startup) — give it room. */
const VAULT_MOUNT_TIMEOUT_MS = 30_000

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
}

function usage(): string {
  return [
    c.bold('kanwas') + ' — open any folder as a live Kanwas canvas',
    '',
    'Usage:',
    '  kanwas up [folder]         Mount a folder and open it (joins a running daemon; starts one if needed)',
    '  kanwas ls                  List every folder Kanwas knows about',
    '  kanwas rm <folder|id>      Unmount + forget a folder (never touches its contents)',
    '  kanwas status              Show what is running (pid, ports, every mounted vault)',
    '  kanwas down                Stop the daemon (unmounts every folder)',
    '',
    'Options (up):',
    '  --rebuild-web          Force a rebuild of the frontend bundle',
    '  --no-open              Do not launch the browser (just print the URL)',
    '',
    `One daemon, many folders. Fixed ports: REST ${REST_PORT}, Yjs ${YJS_PORT}.`,
    `Folders are tracked in ${VAULTS_FILE}.`,
  ].join('\n')
}

/** True if something is already listening on the port. */
function probePort(port: number, host = HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (listening: boolean) => {
      socket.destroy()
      resolve(listening)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** Does the REST port belong to a kanwasd? (checks the /auth/me local-user shape). */
async function isKanwasd(port: number, host = HOST): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/auth/me`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const body = (await res.json()) as { email?: string }
    return body?.email === LOCAL_USER.email
  } catch {
    return false
  }
}

/** Which PID holds a TCP port (macOS/Linux `lsof`), for clear error messages. */
function pidOnPort(port: number): string {
  try {
    const out = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf-8' })
    return out.stdout.trim().split(/\s+/)[0] || '?'
  } catch {
    return '?'
  }
}

/** Ensure the untracked kanwasup build env exists (self-bootstrapping). */
function ensureEnvFile(): void {
  if (fs.existsSync(KANWASUP_ENV_FILE)) return
  const contents = [
    '# kanwasup build env — loaded ONLY by `vite build --mode kanwasup`. Untracked.',
    '# Written by the `kanwas` launcher (local-daemon). Points the built frontend',
    '# bundle at kanwasd: same-origin app + REST/API on :4300, Yjs socket on :1999.',
    `VITE_API_URL=http://${HOST}:${REST_PORT}`,
    `VITE_YJS_SERVER_URL=${HOST}:${YJS_PORT}`,
    `VITE_AUTH_TOKEN_KEY=${LOCAL_AUTH_TOKEN_KEY}`,
    '',
  ].join('\n')
  fs.writeFileSync(KANWASUP_ENV_FILE, contents, 'utf-8')
  console.log(c.dim(`  wrote ${KANWASUP_ENV_FILE}`))
}

/** Build the frontend bundle into web-dist if missing (or forced). Slow once. */
function ensureWebBuild(force: boolean): void {
  const indexHtml = path.join(WEB_DIST_DIR, 'index.html')
  if (fs.existsSync(indexHtml) && !force) return

  ensureEnvFile()
  const vite = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'vite')
  if (!fs.existsSync(vite)) {
    fail(`Cannot build the frontend: ${vite} not found.\n` + `Run \`pnpm install\` at the repo root first.`)
  }
  console.log(c.yellow('Building the Kanwas web bundle (first run only, ~30-60s)…'))
  fs.rmSync(WEB_DIST_DIR, { recursive: true, force: true })
  const build = spawnSync(vite, ['build', '--mode', 'kanwasup', '--outDir', WEB_DIST_DIR, '--emptyOutDir'], {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    fail(`Frontend build failed (exit ${build.status}). See the vite output above.`)
  }
  // Match the tracked build script: index.html references /app/assets/favicon.png.
  const favSrc = path.join(FRONTEND_DIR, 'public', 'favicon.png')
  const favDst = path.join(WEB_DIST_DIR, 'assets', 'favicon.png')
  try {
    if (fs.existsSync(favSrc)) fs.copyFileSync(favSrc, favDst)
  } catch {
    /* non-fatal */
  }
  console.log(c.green('  web bundle built → ') + c.dim(WEB_DIST_DIR))
}

/** Spawn kanwasd detached, logging to ~/.kanwas/daemon.log. */
function startDaemon(folder: string): number {
  fs.mkdirSync(KANWAS_HOME, { recursive: true })
  if (!fs.existsSync(DAEMON_ENTRY)) {
    fail(`Daemon build missing: ${DAEMON_ENTRY}\nRun \`pnpm --filter local-daemon build\`.`)
  }
  const out = fs.openSync(DAEMON_LOG_FILE, 'a')
  fs.writeSync(out, `\n\n=== kanwas up — ${new Date().toISOString()} — folder=${folder} ===\n`)
  const child = spawn(
    process.execPath,
    [
      DAEMON_ENTRY,
      '--folder',
      folder,
      '--port',
      String(REST_PORT),
      '--yjs-port',
      String(YJS_PORT),
      '--host',
      HOST,
      '--instance-file',
      INSTANCE_FILE,
      '--token-key',
      LOCAL_AUTH_TOKEN_KEY,
    ],
    { detached: true, stdio: ['ignore', out, out] }
  )
  child.unref()
  return child.pid ?? -1
}

/** Wait until the daemon has published its instance record AND the port responds. */
async function waitForReady(folder: string): Promise<DaemonInstance> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const inst = readInstance(INSTANCE_FILE)
    if (inst && path.resolve(inst.folder) === folder && pidAlive(inst.pid) && (await probePort(REST_PORT))) {
      return inst
    }
    await sleep(300)
  }
  fail(`Daemon did not become ready within ${READY_TIMEOUT_MS / 1000}s. See ${DAEMON_LOG_FILE}.`)
}

/** Stop a running daemon (SIGTERM → SIGKILL) and clear its record + free the port. */
async function stopDaemon(inst: DaemonInstance): Promise<void> {
  if (pidAlive(inst.pid)) {
    try {
      process.kill(inst.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + 8000
    while (Date.now() < deadline && pidAlive(inst.pid)) await sleep(200)
    if (pidAlive(inst.pid)) {
      try {
        process.kill(inst.pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
      while (pidAlive(inst.pid)) await sleep(150)
    }
  }
  // Wait for the REST port to actually free up before we rebind it.
  const portDeadline = Date.now() + 5000
  while (Date.now() < portDeadline && (await probePort(inst.restPort))) await sleep(150)
  removeInstance(INSTANCE_FILE)
}

function openInBrowser(url: string): void {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref()
  } catch {
    /* printing the URL below is the fallback */
  }
}

/** Build a URL against the fixed REST port (used for the daemon's REST API, not the browser-facing login URL). */
function daemonUrl(pathAndQuery: string): string {
  return `http://${HOST}:${REST_PORT}${pathAndQuery}`
}

/**
 * Everything `printReady` needs. A full `DaemonInstance` (fresh boot) satisfies
 * this structurally; joining a running daemon builds one from the `POST /vaults`
 * response (no local pid to report unless the instance file happens to still
 * be valid — best-effort, since the daemon may not have been launched by us).
 */
interface ReadyInfo {
  folder: string
  workspaceUrlId: string
  loginUrl: string
  pid?: number
  restPort: number
  yjsPort: number
}

/** Register `folder` with an already-running kanwasd via `POST /vaults`. No restart. */
async function mountVaultViaRest(folder: string): Promise<ReadyInfo> {
  const res = await fetch(daemonUrl('/vaults'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folder }),
    signal: AbortSignal.timeout(VAULT_MOUNT_TIMEOUT_MS),
  }).catch((error: unknown) => {
    fail(
      `Could not reach the running Kanwas daemon on :${REST_PORT}: ${error instanceof Error ? error.message : String(error)}`
    )
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    fail(`Failed to register ${folder} with the running daemon (HTTP ${res.status}).${body ? `\n${body}` : ''}`)
  }
  const data = (await res.json()) as { workspaceUrlId?: string; loginPath?: string }
  if (!data.workspaceUrlId || !data.loginPath) {
    fail(`Unexpected response from the running daemon's POST /vaults (missing workspaceUrlId/loginPath).`)
  }
  // Best-effort pid for display only — the instance file may be stale, absent
  // (daemon started outside the launcher), or simply describe a different boot.
  const inst = readInstance(INSTANCE_FILE)
  return {
    folder,
    workspaceUrlId: data.workspaceUrlId,
    loginUrl: daemonUrl(data.loginPath),
    pid: inst && pidAlive(inst.pid) ? inst.pid : undefined,
    restPort: REST_PORT,
    yjsPort: YJS_PORT,
  }
}

interface VaultListEntry extends VaultEntry {
  mounted: boolean
  active: boolean
}

/** `GET /vaults` — every registered vault, live mounted/active state included. */
async function fetchVaultList(): Promise<VaultListEntry[]> {
  const res = await fetch(daemonUrl('/vaults'), { signal: AbortSignal.timeout(5000) })
  if (!res.ok) fail(`GET /vaults failed (HTTP ${res.status}).`)
  return (await res.json()) as VaultListEntry[]
}

/** `DELETE /vaults/:id` — unmount + unregister. Returns false on 404 (unknown to the daemon). */
async function deleteVaultViaRest(id: string): Promise<boolean> {
  const res = await fetch(daemonUrl(`/vaults/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 404) return false
  if (!res.ok) fail(`DELETE /vaults/${id} failed (HTTP ${res.status}).`)
  return true
}

/** Sort by `lastOpenedAt` descending — a local twin of vaults.ts's `byRecency` that also
 * works on the REST-shaped list (which carries extra `mounted`/`active` fields). */
function sortByRecency<T extends { lastOpenedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt))
}

function printVaultTable(vaults: Array<{ path: string; label?: string; mounted: boolean; active: boolean }>): void {
  if (vaults.length === 0) {
    console.log(c.dim('  (no vaults)'))
    return
  }
  const nameWidth = Math.max(4, ...vaults.map((v) => (v.label || path.basename(v.path)).length))
  for (const v of vaults) {
    const name = (v.label || path.basename(v.path)).padEnd(nameWidth)
    const marker = v.active ? c.green('active ') : v.mounted ? c.cyan('mounted') : c.dim('-      ')
    console.log(`  ${marker}  ${c.bold(name)}  ${c.dim(v.path)}`)
  }
}

function printReady(info: ReadyInfo, opened: boolean, joined: boolean): void {
  console.log('')
  console.log(c.green(c.bold('  Kanwas is running.')))
  console.log(`  folder:    ${c.cyan(info.folder)}`)
  console.log(`  workspace: ${info.workspaceUrlId}`)
  console.log(`  open:      ${c.bold(c.cyan(info.loginUrl))}`)
  const pidPart = info.pid ? `pid ${info.pid} · ` : ''
  console.log(c.dim(`  (${pidPart}REST :${info.restPort} · Yjs :${info.yjsPort} · logs ${DAEMON_LOG_FILE})`))
  if (joined) console.log(c.dim('  joined the already-running Kanwas daemon — no restart.'))
  if (opened) console.log(c.dim('  opening in your browser…'))
  console.log('')
}

function fail(message: string): never {
  console.error(c.red('kanwas: ') + message)
  process.exit(1)
}

async function cmdUp(args: string[]): Promise<void> {
  const rebuildWeb = args.includes('--rebuild-web')
  const noOpen = args.includes('--no-open')
  const folderArg = args.find((a) => !a.startsWith('--'))
  const folder = path.resolve(folderArg ?? process.cwd())
  fs.mkdirSync(folder, { recursive: true })

  // 1. A kanwasd is already listening — join it (register + mount), no restart.
  //    This works even if the instance file is missing or stale: isKanwasd()
  //    is a live probe (`GET /auth/me`), not a read of daemon.json.
  if (await probePort(REST_PORT)) {
    if (!(await isKanwasd(REST_PORT))) {
      fail(
        `Port ${REST_PORT} is already in use by another process (pid ${pidOnPort(REST_PORT)}), and it isn't a kanwasd.\n` +
          `  kanwasd uses fixed ports ${REST_PORT}/${YJS_PORT}. Stop that process, e.g.:\n` +
          `    lsof -ti tcp:${REST_PORT} | xargs kill\n` +
          `  then re-run \`kanwas up\`.`
      )
    }
    console.log(c.dim(`Registering ${folder} with the running Kanwas daemon on :${REST_PORT} …`))
    const info = await mountVaultViaRest(folder)
    if (!noOpen) openInBrowser(info.loginUrl)
    printReady(info, !noOpen, true)
    return
  }

  // 2. Nothing running — port guards, build (first run / forced), then boot fresh.
  if (await probePort(YJS_PORT)) {
    fail(
      `Port ${YJS_PORT} (Yjs) is in use by another process (pid ${pidOnPort(YJS_PORT)}).\n` +
        `  Free it (\`lsof -ti tcp:${YJS_PORT} | xargs kill\`) and retry.`
    )
  }
  ensureWebBuild(rebuildWeb)
  console.log(c.dim(`Starting Kanwas on ${folder} …`))
  startDaemon(folder)
  const inst = await waitForReady(folder)
  if (!noOpen) openInBrowser(inst.loginUrl)
  printReady(inst, !noOpen, false)
}

async function cmdLs(): Promise<void> {
  if (await probePort(REST_PORT)) {
    if (await isKanwasd(REST_PORT)) {
      const vaults = sortByRecency(await fetchVaultList())
      console.log(c.bold('Kanwas vaults') + c.dim(` — daemon running on :${REST_PORT}`))
      printVaultTable(vaults)
      return
    }
    console.log(c.yellow(`Port ${REST_PORT} is in use by pid ${pidOnPort(REST_PORT)}, but it isn't a kanwasd.`))
  } else {
    console.log(c.yellow('Kanwas daemon is not running.') + ' Showing the registry from disk:')
  }
  const registry = loadRegistry(VAULTS_FILE)
  printVaultTable(
    byRecency(registry.vaults).map((v) => ({
      ...v,
      mounted: false,
      active: v.workspaceId === registry.activeWorkspaceId,
    }))
  )
}

async function cmdRm(args: string[]): Promise<void> {
  const target = args.find((a) => !a.startsWith('--'))
  if (!target) fail('Usage: kanwas rm <folder-or-id>')
  const looksLikePath = target.includes('/') || fs.existsSync(target)
  const resolvedPath = (): string => {
    const resolved = path.resolve(target)
    return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
  }

  if ((await probePort(REST_PORT)) && (await isKanwasd(REST_PORT))) {
    let id = target
    if (looksLikePath) {
      const real = resolvedPath()
      const match = (await fetchVaultList()).find((v) => v.path === real)
      if (!match) fail(`No registered vault matches path ${real}.`)
      id = match.workspaceId
    }
    const removed = await deleteVaultViaRest(id)
    if (!removed) fail(`Unknown vault: ${target}`)
    console.log(c.green(`Removed ${target} from Kanwas.`))
    console.log(c.dim("  the folder and its contents were not touched — only Kanwas's registry was updated."))
    return
  }

  // Daemon down — mutate vaults.json directly (registry-only; never touches folder contents).
  let registry = loadRegistry(VAULTS_FILE)
  const workspaceId = looksLikePath
    ? registry.vaults.find((v) => v.path === resolvedPath())?.workspaceId
    : registry.vaults.find((v) => v.workspaceId === target || v.workspaceId.replace(/-/g, '') === target)?.workspaceId
  if (!workspaceId) fail(`Unknown vault: ${target}`)
  registry = unregisterVault(registry, workspaceId)
  if (!registry.activeWorkspaceId && registry.vaults.length > 0) {
    const next = byRecency(registry.vaults)[0]
    registry = touchVault(registry, next.workspaceId, next.lastOpenedAt) // promote without bumping recency
  }
  saveRegistry(registry, VAULTS_FILE)
  console.log(c.green(`Removed ${target} from the Kanwas registry (daemon is not running).`))
  console.log(c.dim("  the folder and its contents were not touched — only Kanwas's registry was updated."))
}

async function cmdDown(): Promise<void> {
  const inst = readInstance(INSTANCE_FILE)
  if (inst && pidAlive(inst.pid)) {
    console.log(c.dim(`Stopping Kanwas (pid ${inst.pid}) — this unmounts every workspace the daemon was serving …`))
    await stopDaemon(inst)
    console.log(c.green('Kanwas stopped. All workspaces are unmounted; nothing was deleted from disk.'))
    return
  }
  removeInstance(INSTANCE_FILE)
  console.log('No tracked Kanwas daemon is running.')
  if (await probePort(REST_PORT)) {
    console.log(c.yellow(`Note: port ${REST_PORT} is in use by pid ${pidOnPort(REST_PORT)} (not launcher-tracked).`))
  }
}

async function cmdStatus(): Promise<void> {
  const running = (await probePort(REST_PORT)) && (await isKanwasd(REST_PORT))
  if (!running) {
    const inst = readInstance(INSTANCE_FILE)
    if (!inst || !pidAlive(inst.pid)) {
      console.log('Kanwas: ' + c.yellow('not running'))
      if (inst) console.log(c.dim(`  (stale record for dead pid ${inst.pid} on ${inst.folder})`))
      return
    }
    console.log('Kanwas: ' + c.yellow('not running'))
    console.log(c.dim(`  (pid ${inst.pid} is alive but :${REST_PORT} is not answering as a kanwasd)`))
    return
  }

  // The instance file is only written at boot and can name a stale active
  // folder once other vaults have been mounted/unmounted since — prefer the
  // LIVE vault list for what's actually mounted; the instance file is only
  // used for pid/ports/startedAt, which don't change across the daemon's life.
  const inst = readInstance(INSTANCE_FILE)
  const vaults = sortByRecency(await fetchVaultList())
  console.log(c.green(c.bold('Kanwas: running')))
  if (inst) {
    console.log(`  pid:       ${inst.pid}`)
    console.log(`  started:   ${inst.startedAt}`)
  }
  console.log(`  ports:     REST :${REST_PORT} · Yjs :${YJS_PORT}`)
  const active = vaults.find((v) => v.active)
  if (active) {
    const urlId = active.workspaceId.replace(/-/g, '')
    console.log(`  open:      ${c.cyan(daemonUrl(`/local-login?to=/app/w/${urlId}`))}`)
  }
  console.log(`  vaults (${vaults.length}):`)
  printVaultTable(vaults)
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'up':
      return cmdUp(rest)
    case 'ls':
    case 'list':
      return cmdLs()
    case 'rm':
    case 'remove':
      return cmdRm(rest)
    case 'down':
    case 'stop':
      return cmdDown()
    case 'status':
      return cmdStatus()
    case '-h':
    case '--help':
    case 'help':
    case undefined:
      console.log(usage())
      return
    default:
      console.error(c.red(`Unknown command: ${cmd}\n`))
      console.log(usage())
      process.exit(1)
  }
}

main().catch((error) => {
  console.error(c.red('kanwas failed: '), error)
  process.exit(1)
})
