import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '../src/logger.js'
import type { Mount } from '../src/mount.js'
import type { MountManager } from '../src/mount-manager.js'
import { VaultService } from '../src/vault-service.js'

const logger = createLogger({ level: 'silent' })
const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-vault-service-'))
  tmpDirs.push(dir)
  return dir
}

function mountStub(folder: string, workspaceId = 'workspace-1'): Mount {
  return {
    folder,
    workspaceId,
    workspaceUrlId: workspaceId.replace(/-/g, ''),
    orchestrator: {} as Mount['orchestrator'],
    handleUpload: vi.fn(),
    stop: vi.fn(async () => undefined),
  }
}

describe('VaultService terminal cleanup', () => {
  it('disposes workspace terminals before unmounting and never deletes vault contents', async () => {
    const stateDir = tempDir()
    const vaultDir = tempDir()
    const keptFile = path.join(vaultDir, 'kept.md')
    fs.writeFileSync(keptFile, '# keep me\n')
    const mount = mountStub(vaultDir)
    const liveMounts = new Map([[mount.workspaceId, mount]])
    const order: string[] = []
    const mountManager = {
      get: (workspaceId: string) => liveMounts.get(workspaceId),
      mount: vi.fn(async () => mount),
      unmount: vi.fn(async (workspaceId: string) => {
        order.push(`unmount:${workspaceId}`)
        liveMounts.delete(workspaceId)
      }),
    } as unknown as MountManager
    const service = new VaultService({
      registryFile: path.join(stateDir, 'vaults.json'),
      mountManager,
      logger,
      disposeWorkspace: vi.fn(async (workspaceId: string) => {
        order.push(`dispose:${workspaceId}`)
      }),
    })
    await service.initialize()
    await service.openVault(vaultDir)

    await service.forgetVault(mount.workspaceId)

    expect(order).toEqual([`dispose:${mount.workspaceId}`, `unmount:${mount.workspaceId}`])
    expect(service.listVaults()).toEqual([])
    expect(fs.readFileSync(keptFile, 'utf-8')).toBe('# keep me\n')
  })

  it('still attempts unmount when terminal disposal fails and keeps the registry entry', async () => {
    const stateDir = tempDir()
    const vaultDir = tempDir()
    const mount = mountStub(vaultDir)
    const liveMounts = new Map([[mount.workspaceId, mount]])
    const unmount = vi.fn(async (workspaceId: string) => {
      liveMounts.delete(workspaceId)
    })
    const mountManager = {
      get: (workspaceId: string) => liveMounts.get(workspaceId),
      mount: vi.fn(async () => mount),
      unmount,
    } as unknown as MountManager
    const service = new VaultService({
      registryFile: path.join(stateDir, 'vaults.json'),
      mountManager,
      logger,
      disposeWorkspace: vi.fn(async () => {
        throw new Error('PTY did not exit')
      }),
    })
    await service.initialize()
    await service.openVault(vaultDir)

    await expect(service.forgetVault(mount.workspaceId)).rejects.toThrow('Failed to cleanly forget workspace')

    expect(unmount).toHaveBeenCalledWith(mount.workspaceId)
    expect(service.listVaults()).toEqual([expect.objectContaining({ id: mount.workspaceId })])
  })
})
