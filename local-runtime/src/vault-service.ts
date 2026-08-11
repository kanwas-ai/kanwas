import fs from 'node:fs'
import path from 'node:path'
import type { Logger } from 'pino'
import type { VaultSummary, WorkspaceSummary } from 'shared/local-api'
import type { Mount } from './mount.js'
import type { MountManager } from './mount-manager.js'
import { byRecency, loadRegistry, registerVault, saveRegistry, touchVault, unregisterVault } from './vaults.js'

const MAX_BOOT_VAULTS = 10

export interface VaultServiceOptions {
  registryFile: string
  legacyRegistryFile?: string
  mountManager: MountManager
  logger: Logger
  disposeWorkspace?: (workspaceId: string) => Promise<void>
}

export class VaultService {
  private readonly registryFile: string
  private readonly legacyRegistryFile?: string
  private readonly mountManager: MountManager
  private readonly logger: Logger
  private readonly disposeWorkspace: (workspaceId: string) => Promise<void>
  private registry = { vaults: [] } as ReturnType<typeof loadRegistry>
  private readonly mountErrors = new Map<string, string>()

  constructor(options: VaultServiceOptions) {
    this.registryFile = options.registryFile
    this.legacyRegistryFile = options.legacyRegistryFile
    this.mountManager = options.mountManager
    this.logger = options.logger.child({ component: 'VaultService' })
    this.disposeWorkspace = options.disposeWorkspace ?? (async () => undefined)
  }

  async initialize(): Promise<void> {
    this.importLegacyRegistryIfNeeded()
    this.registry = loadRegistry(this.registryFile, this.logger)
    for (const entry of byRecency(this.registry.vaults).slice(0, MAX_BOOT_VAULTS)) {
      if (!fs.existsSync(entry.path)) continue
      try {
        await this.mountManager.mount(entry.path)
      } catch (error) {
        this.mountErrors.set(entry.workspaceId, error instanceof Error ? error.message : String(error))
      }
    }
    const activeMounted = this.registry.activeWorkspaceId && this.mountManager.get(this.registry.activeWorkspaceId)
    if (!activeMounted) {
      const newestMounted = byRecency(this.registry.vaults).find((entry) => this.mountManager.get(entry.workspaceId))
      this.registry = { ...this.registry, activeWorkspaceId: newestMounted?.workspaceId }
      if (newestMounted) saveRegistry(this.registry, this.registryFile)
    }
  }

  listVaults(): VaultSummary[] {
    return byRecency(this.registry.vaults).map((entry) => {
      const mount = this.mountManager.get(entry.workspaceId)
      const error = this.mountErrors.get(entry.workspaceId)
      const status = mount ? 'mounted' : error ? 'error' : fs.existsSync(entry.path) ? 'available' : 'missing'
      const label = entry.label?.trim() || path.basename(entry.path) || entry.path
      return {
        id: entry.workspaceId,
        urlId: entry.workspaceId.replace(/-/g, ''),
        name: label,
        label,
        path: entry.path,
        status,
        active: entry.workspaceId === this.registry.activeWorkspaceId,
        lastOpenedAt: entry.lastOpenedAt,
        ...(error ? { error } : {}),
      }
    })
  }

  getActiveVault(): VaultSummary | undefined {
    return this.listVaults().find((vault) => vault.active && vault.status === 'mounted')
  }

  getWorkspaceName(workspaceId: string): string {
    const entry = this.registry.vaults.find((vault) => vault.workspaceId === workspaceId)
    return entry?.label?.trim() || path.basename(entry?.path ?? '') || 'Local Workspace'
  }

  async openVault(folder: string, label?: string): Promise<WorkspaceSummary> {
    const mount = await this.mountManager.mount(folder)
    this.mountErrors.delete(mount.workspaceId)
    this.registry = registerVault(this.registry, {
      path: mount.folder,
      workspaceId: mount.workspaceId,
      label: label?.trim() || undefined,
    })
    this.registry = touchVault(this.registry, mount.workspaceId)
    saveRegistry(this.registry, this.registryFile)
    return this.workspaceSummary(mount)
  }

  async activateVault(workspaceId: string): Promise<WorkspaceSummary> {
    const entry = this.registry.vaults.find((vault) => vault.workspaceId === workspaceId)
    if (!entry) throw new Error('Unknown vault')
    if (!fs.existsSync(entry.path)) throw new Error(`Vault folder is missing: ${entry.path}`)
    const mount = this.mountManager.get(workspaceId) ?? (await this.mountManager.mount(entry.path))
    this.mountErrors.delete(workspaceId)
    this.registry = touchVault(this.registry, workspaceId)
    saveRegistry(this.registry, this.registryFile)
    return this.workspaceSummary(mount)
  }

  renameVaultLabel(workspaceId: string, label: string): WorkspaceSummary {
    const trimmed = label.trim()
    if (!trimmed) throw new Error('Vault label cannot be empty')
    const entry = this.registry.vaults.find((vault) => vault.workspaceId === workspaceId)
    if (!entry) throw new Error('Unknown vault')
    this.registry = {
      ...this.registry,
      vaults: this.registry.vaults.map((vault) =>
        vault.workspaceId === workspaceId ? { ...vault, label: trimmed } : vault
      ),
    }
    saveRegistry(this.registry, this.registryFile)
    const mount = this.mountManager.get(workspaceId)
    return mount
      ? this.workspaceSummary(mount)
      : { id: workspaceId, urlId: workspaceId.replace(/-/g, ''), name: trimmed, path: entry.path }
  }

  async forgetVault(workspaceId: string): Promise<void> {
    if (!this.registry.vaults.some((vault) => vault.workspaceId === workspaceId)) throw new Error('Unknown vault')
    const cleanupErrors: unknown[] = []
    for (const cleanup of [() => this.disposeWorkspace(workspaceId), () => this.mountManager.unmount(workspaceId)]) {
      try {
        await cleanup()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, `Failed to cleanly forget workspace ${workspaceId}`)
    }
    this.mountErrors.delete(workspaceId)
    this.registry = unregisterVault(this.registry, workspaceId)
    const next = byRecency(this.registry.vaults).find((entry) => this.mountManager.get(entry.workspaceId))
    if (next) this.registry = touchVault(this.registry, next.workspaceId, next.lastOpenedAt)
    saveRegistry(this.registry, this.registryFile)
  }

  private workspaceSummary(mount: Mount): WorkspaceSummary {
    return {
      id: mount.workspaceId,
      urlId: mount.workspaceUrlId,
      name: this.getWorkspaceName(mount.workspaceId),
      path: mount.folder,
    }
  }

  private importLegacyRegistryIfNeeded(): void {
    if (fs.existsSync(this.registryFile) || !this.legacyRegistryFile || !fs.existsSync(this.legacyRegistryFile)) return
    const legacy = loadRegistry(this.legacyRegistryFile, this.logger)
    if (legacy.vaults.length === 0) return
    fs.mkdirSync(path.dirname(this.registryFile), { recursive: true })
    saveRegistry(legacy, this.registryFile)
    this.logger.info({ from: this.legacyRegistryFile, to: this.registryFile }, 'Imported legacy vault registry')
  }
}
