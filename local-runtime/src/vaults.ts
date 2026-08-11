// Persistent remembered-vault state. Electron injects a registry path under
// its `userData` directory; VaultService owns the optional one-time import of
// the legacy registry and decides which remembered folders to mount at startup.
//
// Kept deliberately dumb: plain data in, plain data out. All functions are pure
// (they return a NEW registry rather than mutating the one passed in) so the
// callers — which already own the "when do I save" decision — stay in control
// of exactly when a mutation hits disk.
import fs from 'node:fs'
import path from 'node:path'
import type { Logger } from 'pino'

export interface VaultEntry {
  /** Absolute, symlink-resolved folder path — matches MountManager's dedupe key. */
  path: string
  workspaceId: string
  /** User-facing label; falls back to `path.basename(path)` when absent (see rest-server.ts). */
  label?: string
  lastOpenedAt: string
}

export interface VaultRegistry {
  vaults: VaultEntry[]
  /** The vault Electron opens when the application starts. */
  activeWorkspaceId?: string
}

function emptyRegistry(): VaultRegistry {
  return { vaults: [] }
}

function isVaultEntry(value: unknown): value is VaultEntry {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    typeof v.workspaceId === 'string' &&
    v.workspaceId.length > 0 &&
    typeof v.lastOpenedAt === 'string' &&
    (v.label === undefined || typeof v.label === 'string')
  )
}

/**
 * Load the registry from `file`. Missing or corrupt (bad JSON, wrong shape,
 * malformed entries) → an EMPTY registry, logged — never a thrown error. The
 * file itself is left untouched on a corrupt read; it is only ever overwritten
 * by a subsequent `saveRegistry` after a legitimate mutation, never by the act
 * of loading. A broken vaults.json must never crash runtime boot.
 */
export function loadRegistry(file: string, logger?: Logger): VaultRegistry {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger?.warn({ file, error: String(error) }, 'Could not read vault registry — starting empty')
    }
    return emptyRegistry()
  }

  let parsed: Partial<VaultRegistry>
  try {
    parsed = JSON.parse(raw) as Partial<VaultRegistry>
  } catch (error) {
    logger?.warn({ file, error: String(error) }, 'Vault registry is corrupt JSON — starting empty')
    return emptyRegistry()
  }

  if (!parsed || !Array.isArray(parsed.vaults)) {
    logger?.warn({ file }, 'Vault registry has an unexpected shape — starting empty')
    return emptyRegistry()
  }

  const validVaults = parsed.vaults.filter(isVaultEntry)
  const seenPaths = new Set<string>()
  const seenWorkspaceIds = new Set<string>()
  const vaults = byRecency(validVaults).filter((entry) => {
    const key = pathKey(entry.path)
    if (seenPaths.has(key) || seenWorkspaceIds.has(entry.workspaceId)) return false
    seenPaths.add(key)
    seenWorkspaceIds.add(entry.workspaceId)
    return true
  })
  if (vaults.length !== parsed.vaults.length) {
    logger?.warn(
      { file, dropped: parsed.vaults.length - vaults.length },
      'Dropped malformed or duplicate entries from vault registry'
    )
  }

  const activeWorkspaceId = typeof parsed.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : undefined
  return { vaults, activeWorkspaceId }
}

/** Atomically persist the registry: write to a tmp file, then rename over the target. */
export function saveRegistry(registry: VaultRegistry, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8')
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        fs.renameSync(tmp, file)
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        const transient = process.platform === 'win32' && ['EACCES', 'EBUSY', 'EEXIST', 'EPERM'].includes(code ?? '')
        if (!transient || attempt >= 5) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function pathKey(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

/**
 * Upsert a vault entry by `path` (the realpath — mount-manager already dedupes
 * this way, so the registry uses the same key). Registering an already-known
 * path updates it in place rather than duplicating it; an explicit `label`
 * replaces the stored one, otherwise the existing label (if any) is preserved.
 */
export function registerVault(
  registry: VaultRegistry,
  entry: { path: string; workspaceId: string; label?: string; lastOpenedAt?: string }
): VaultRegistry {
  const key = pathKey(entry.path)
  const existing = registry.vaults.find((v) => pathKey(v.path) === key || v.workspaceId === entry.workspaceId)
  const label = entry.label ?? existing?.label
  const lastOpenedAt = entry.lastOpenedAt ?? existing?.lastOpenedAt ?? new Date().toISOString()
  const vaults = registry.vaults.filter((v) => pathKey(v.path) !== key && v.workspaceId !== entry.workspaceId)
  vaults.push({ path: entry.path, workspaceId: entry.workspaceId, label, lastOpenedAt })
  return { ...registry, vaults }
}

/** Remove a vault by workspaceId. Registry-only — never touches the folder itself. */
export function unregisterVault(registry: VaultRegistry, workspaceId: string): VaultRegistry {
  const vaults = registry.vaults.filter((v) => v.workspaceId !== workspaceId)
  const activeWorkspaceId = registry.activeWorkspaceId === workspaceId ? undefined : registry.activeWorkspaceId
  return { vaults, activeWorkspaceId }
}

/** Bump `lastOpenedAt` (defaults to now) for a vault and mark it the active workspace. */
export function touchVault(
  registry: VaultRegistry,
  workspaceId: string,
  lastOpenedAt: string = new Date().toISOString()
): VaultRegistry {
  const vaults = registry.vaults.map((v) => (v.workspaceId === workspaceId ? { ...v, lastOpenedAt } : v))
  return { ...registry, vaults, activeWorkspaceId: workspaceId }
}

/** Vault entries most-recently-opened first (ties broken by registry order). */
export function byRecency(vaults: VaultEntry[]): VaultEntry[] {
  return [...vaults].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt))
}
