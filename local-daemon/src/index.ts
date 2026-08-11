#!/usr/bin/env node
// kanwasd — one Node process that serves local folders as Kanwas workspaces to
// the stock frontend. See README.md for the architecture. Bidirectional folder
// ↔ yDoc sync (adoption, live watch, and the yDoc→folder FolderFlusher) is
// fully wired — see mount.ts for the per-folder bring-up sequence. Since Phase
// 2 the daemon is genuinely multi-folder: a persistent vault registry
// (vaults.ts) remounts every known folder at boot, and `--folder` is now just
// one more folder to add on top of it (optional — the registry alone can boot
// the daemon).
import fs from 'node:fs'
import { parseConfig } from './config.js'
import { createLogger } from './logger.js'
import { generateSecret } from './identity.js'
import { removeInstance, writeInstance } from './instance.js'
import { FolderStore } from './folder-store.js'
import { startYjsCore } from './yjs-core.js'
import { MountManager } from './mount-manager.js'
import type { Mount } from './mount.js'
import { startRestServer } from './rest-server.js'
import { VAULTS_FILE } from './paths.js'
import { TerminalSessionManager } from './terminal/session-manager.js'
import { byRecency, loadRegistry, registerVault, saveRegistry, touchVault } from './vaults.js'

/**
 * Cap on how many registered vaults get remounted at boot. A long history of
 * vaults must never balloon boot time/memory — anything beyond the cap stays
 * registered (just not auto-mounted); the Phase 3 CLI can mount it on demand
 * via `POST /vaults`.
 */
const MAX_BOOT_VAULTS = 10

async function main(): Promise<void> {
  const config = parseConfig(process.argv)
  const logger = createLogger({ level: config.logLevel, pretty: config.pretty })
  const log = logger.child({ component: 'kanwasd' })

  const secret = generateSecret()
  const clientHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host

  log.info({ folder: config.folder, restPort: config.restPort, yjsPort: config.yjsPort }, 'Starting kanwasd')

  // 1. Embedded Yjs sync core (socket.io + token verify + admin HTTP). The
  //    FolderStore is the persistence seam: it buffers bytes AND (once a mount
  //    binds its flusher) flushes UI edits to that mount's folder.
  const store = new FolderStore()
  const yjsCore = await startYjsCore({
    secret,
    store,
    host: config.host,
    port: config.yjsPort,
  })

  const mountManager = new MountManager({
    roomManager: yjsCore.roomManager,
    store,
    secret,
    clientHost,
    yjsPort: config.yjsPort,
    logger,
  })

  // 2. Mount every folder the persistent vault registry (~/.kanwas/vaults.json,
  //    or $KANWAS_HOME/vaults.json under the test override) remembers,
  //    most-recently-opened first, capped at MAX_BOOT_VAULTS. A registered
  //    path missing on disk (moved folder, unmounted drive, …) is a warn+skip
  //    — the entry is KEPT, never silently deregistered, in case it comes
  //    back. MountManager.mount already catches and logs a single bad mount
  //    without taking down the daemon or any other mount.
  let registry = loadRegistry(VAULTS_FILE, logger)
  const candidates = byRecency(registry.vaults)
  const toMount = candidates.slice(0, MAX_BOOT_VAULTS)
  const skippedByCap = candidates.slice(MAX_BOOT_VAULTS)
  if (skippedByCap.length > 0) {
    log.warn(
      { count: skippedByCap.length, paths: skippedByCap.map((v) => v.path) },
      'Skipped registered vaults beyond the boot cap'
    )
  }
  let mostRecentRegistryMount: Mount | undefined
  for (const vault of toMount) {
    if (!fs.existsSync(vault.path)) {
      log.warn(
        { path: vault.path, workspaceId: vault.workspaceId },
        'Registered vault is missing on disk — skipping at boot (entry kept)'
      )
      continue
    }
    try {
      const mount = await mountManager.mount(vault.path)
      mostRecentRegistryMount ??= mount
    } catch (error) {
      log.error({ path: vault.path, error: String(error) }, 'Failed to mount registered vault at boot')
    }
  }

  // 3. `--folder` is OPTIONAL (Phase 2): the daemon can boot from the registry
  //    alone. When passed, mount it too (idempotent by realpath — a no-op if
  //    the registry loop above already covered it) and make it the active
  //    vault; otherwise the active vault is whichever registry mount actually
  //    came up most recently. Error only if NEITHER yields anything to serve.
  //    The active vault is registered+touched so the registry's
  //    `activeWorkspaceId` — read by rest-server.ts for `/local-login`'s
  //    default target — is always correct for THIS run, not stale from a
  //    previous one.
  let activeMount: Mount | undefined
  if (config.folder) {
    activeMount = await mountManager.mount(config.folder)
  } else {
    activeMount = mostRecentRegistryMount
  }
  if (!activeMount) {
    throw new Error(`Nothing to serve: pass --folder, or register a vault first (no mountable vault in ${VAULTS_FILE})`)
  }
  registry = registerVault(registry, { path: activeMount.folder, workspaceId: activeMount.workspaceId })
  registry = touchVault(registry, activeMount.workspaceId)
  saveRegistry(registry, VAULTS_FILE)

  // 3b. Embedded PTY terminal sessions (WP-D) — one manager for the whole
  //     daemon (sessions carry their owning workspaceId internally); REST/WS
  //     wiring lives in rest-server.ts, lifecycle (disposeAll) lives here.
  const terminalManager = new TerminalSessionManager({ logger })

  // 4. REST surface + static frontend bundle + /local-login + token mint +
  //    upload → folder — now multi-workspace: one REST view over every live
  //    mount, plus vault-management routes (POST/DELETE /vaults) for Phase 3's CLI.
  const rest = await startRestServer({
    mountManager,
    roomManager: yjsCore.roomManager,
    registryFile: VAULTS_FILE,
    secret,
    host: config.host,
    port: config.restPort,
    logger,
    webDist: config.webDist,
    tokenKey: config.tokenKey,
    terminalManager,
  })

  const loginUrl = `${rest.baseUrl}/local-login`
  const workspaceUrl = `/app/w/${activeMount.workspaceUrlId}`

  // 5. Publish the single-instance record so the `kanwas` launcher can find us
  //    (only when started via the launcher, i.e. --instance-file was passed).
  //    Unchanged shape from Phase 1, filled from the ACTIVE mount (the
  //    --folder one, or the most recently opened registry vault).
  if (config.instanceFile) {
    writeInstance(config.instanceFile, {
      pid: process.pid,
      folder: activeMount.folder,
      host: clientHost,
      restPort: config.restPort,
      yjsPort: config.yjsPort,
      workspaceId: activeMount.workspaceId,
      workspaceUrlId: activeMount.workspaceUrlId,
      loginUrl,
      workspaceUrl,
      startedAt: new Date().toISOString(),
    })
  }

  log.info(
    {
      apiUrl: rest.baseUrl,
      yjsUrl: `${clientHost}:${config.yjsPort}`,
      loginUrl,
      workspaceUrl,
      mountedVaults: mountManager.list().length,
    },
    'kanwasd ready — open the loginUrl (or point the frontend at VITE_API_URL/VITE_YJS_SERVER_URL)'
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log.info({ signal }, 'Shutting down kanwasd')
    if (config.instanceFile) removeInstance(config.instanceFile)
    try {
      terminalManager.disposeAll()
      await mountManager.stopAll()
      await rest.close()
      await yjsCore.close()
    } catch (error) {
      log.error({ error: String(error) }, 'Error during shutdown')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error('kanwasd failed to start:', error)
  process.exit(1)
})
