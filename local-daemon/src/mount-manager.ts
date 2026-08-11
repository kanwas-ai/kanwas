// Registry of LIVE per-folder mounts (in-process state — which folders are
// currently up). This is deliberately separate from the persistent vaults.json
// registry (vaults.ts): that one remembers folders across restarts; this one
// tracks what's actually mounted right now. index.ts mounts everything
// vaults.json remembers at boot (plus --folder, if given); rest-server.ts's
// vault-management routes (POST/DELETE /vaults) mount/unmount through this at
// runtime and persist the corresponding change to vaults.json.
import fs from 'node:fs'
import type { Logger } from 'pino'
import type { RunningYjsServer } from 'kanwas-yjs-server/server'
import type { FolderStore } from './folder-store.js'
import { mountFolder, type Mount } from './mount.js'

export interface MountManagerOptions {
  roomManager: RunningYjsServer['roomManager']
  store: FolderStore
  secret: string
  clientHost: string
  yjsPort: number
  logger: Logger
}

export class MountManager {
  private readonly roomManager: RunningYjsServer['roomManager']
  private readonly store: FolderStore
  private readonly secret: string
  private readonly clientHost: string
  private readonly yjsPort: number
  private readonly logger: Logger
  private readonly mounts = new Map<string, Mount>()

  constructor(options: MountManagerOptions) {
    this.roomManager = options.roomManager
    this.store = options.store
    this.secret = options.secret
    this.clientHost = options.clientHost
    this.yjsPort = options.yjsPort
    this.logger = options.logger
  }

  /**
   * Mount `folder` as a workspace. Idempotent by resolved (symlink-free) path — a
   * second call for the same folder returns the existing mount rather than
   * double-mounting it. A failure here (bad adoption, port conflict, etc.) is
   * caught and logged with the offending folder, then rethrown as a clean error
   * to the caller — one bad mount must never crash the daemon or take down any
   * other mount.
   */
  async mount(folder: string): Promise<Mount> {
    fs.mkdirSync(folder, { recursive: true }) // must exist before realpath resolves it
    const resolved = fs.realpathSync(folder)
    const existing = this.getByFolder(resolved)
    if (existing) return existing

    try {
      const mount = await mountFolder({
        folder: resolved,
        roomManager: this.roomManager,
        store: this.store,
        secret: this.secret,
        clientHost: this.clientHost,
        yjsPort: this.yjsPort,
        logger: this.logger,
      })
      this.mounts.set(mount.workspaceId, mount)
      return mount
    } catch (error) {
      this.logger.error({ folder: resolved, error: String(error) }, 'Failed to mount folder')
      throw new Error(`Failed to mount ${resolved}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Unmount a workspace. Order matters here (Phase 2 unmount-safety fix):
   *
   * 1. `roomManager.closeRoom()` FIRST, while this mount's flusher is still
   *    bound. It disconnects every attached socket — frontend clients AND this
   *    mount's own watcher-client connection (a server-initiated disconnect,
   *    so the socket.io client won't auto-reconnect and resurrect the room) —
   *    and runs the room's own flush-on-close, which pushes the very latest
   *    yDoc state through `FolderStore.saveRoot`/`saveNote` into the
   *    still-bound flusher.
   * 2. `flusher.flushNow()` forces that save to disk immediately, bypassing
   *    the flusher's own debounce, while it's still bound.
   * 3. `mount.stop()` stops the now-already-disconnected orchestrator and
   *    unbinds the flusher.
   *
   * Without step 1 before unbinding, a room could stay alive with connected
   * sockets and no persistence path at all — clients would keep "editing"
   * into a void. Without step 2, an in-flight (not-yet-debounced) edit at the
   * moment of unmount would reach the flusher but never actually hit disk
   * before it unbinds in step 3.
   */
  async unmount(workspaceId: string): Promise<void> {
    const mount = this.mounts.get(workspaceId)
    if (!mount) return
    this.mounts.delete(workspaceId)
    await this.roomManager.closeRoom(workspaceId)
    await mount.orchestrator.flusher.flushNow()
    await mount.stop()
  }

  get(workspaceId: string): Mount | undefined {
    return this.mounts.get(workspaceId)
  }

  getByFolder(folder: string): Mount | undefined {
    for (const mount of this.mounts.values()) {
      if (mount.folder === folder) return mount
    }
    return undefined
  }

  list(): Mount[] {
    return [...this.mounts.values()]
  }

  /**
   * Stop every mount using the SAME safe sequence as a single `unmount()` (close
   * room → flush → stop) — SIGINT/SIGTERM must not skip the shutdown flush that a
   * single-vault `DELETE /vaults/:id` already gets. Safe to run concurrently:
   * `unmount()` deletes its entry from `this.mounts` before doing any async work,
   * so the snapshot from `list()` never double-processes a mount.
   */
  async stopAll(): Promise<void> {
    await Promise.all(this.list().map((mount) => this.unmount(mount.workspaceId)))
  }
}
