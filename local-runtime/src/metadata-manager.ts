// Rewrites metadata.yaml sidecars from canonical yDoc-backed state.
//
// ADAPTED from execenv/src/metadata-manager.ts. Changes for local-first:
//   - Audit/actor-identity resolution removed (single user, no cloud identity).
//   - Root-canvas skip removed: the root canvas materializes its sidecar at
//     `<folder>/metadata.yaml` so root-level node ids/positions survive restarts.
//   - Writing goes through an injectable `writeMetadata` so the runtime can tag
//     its own writes for the watcher's echo-suppression.
import path from 'node:path'
import type { Logger } from 'pino'
import type { CanvasItem, CanvasMetadata } from 'shared'
import type { SyncResult } from 'shared/server'
import { buildCanvasMetadata } from './canvas-metadata.js'
import { writeMetadataYaml } from './filesystem.js'

/**
 * Write a canvas dir's metadata.yaml. `canvasPath` is folder-relative ('' = root).
 * `createDir` mirrors `WriteMetadataOptions.createDir` — true only for boot-time
 * materialization of a canvas that has never had a sidecar.
 */
export type MetadataWriter = (
  canvasDir: string,
  canvasPath: string,
  metadata: CanvasMetadata,
  createDir: boolean
) => Promise<void>

export interface MetadataManagerOptions {
  logger: Logger
  workspacePath: string
  findCanvasById: (canvasId: string) => CanvasItem | undefined
  getCanvasPathById: (canvasId: string) => string | undefined
  listCanvasIds: () => string[]
  /** Defaults to a plain writeMetadataYaml (no suppression). */
  writeMetadata?: MetadataWriter
}

export class MetadataManager {
  private readonly log: Logger
  private readonly workspacePath: string
  private readonly findCanvasById: MetadataManagerOptions['findCanvasById']
  private readonly getCanvasPathById: MetadataManagerOptions['getCanvasPathById']
  private readonly listCanvasIds: MetadataManagerOptions['listCanvasIds']
  private readonly writeMetadata: MetadataWriter

  constructor(options: MetadataManagerOptions) {
    this.log = options.logger.child({ component: 'MetadataManager' })
    this.workspacePath = options.workspacePath
    this.findCanvasById = options.findCanvasById
    this.getCanvasPathById = options.getCanvasPathById
    this.listCanvasIds = options.listCanvasIds
    this.writeMetadata =
      options.writeMetadata ??
      (async (canvasDir, _canvasPath, metadata, createDir) => {
        const result = await writeMetadataYaml(canvasDir, metadata, { createDir })
        if (result.skipped) {
          this.log.warn({ canvasDir }, 'Skipped metadata.yaml write: canvas directory does not exist')
        }
      })
  }

  async handleSyncResult(_absolutePath: string, result: SyncResult): Promise<void> {
    const targetCanvasIds = new Set<string>()
    for (const canvasId of result.affectedCanvasIds ?? []) targetCanvasIds.add(canvasId)

    switch (result.action) {
      case 'created_canvas':
        if (result.canvasId) targetCanvasIds.add(result.canvasId)
        if (result.parentCanvasId) targetCanvasIds.add(result.parentCanvasId)
        break
      case 'created_node':
      case 'deleted_node':
      case 'updated_content':
      case 'updated_binary_content':
      case 'updated_metadata': {
        if (result.action === 'updated_metadata' && !result.canvasChanged && result.changedNodeIds.length === 0) return
        if (result.canvasId) targetCanvasIds.add(result.canvasId)
        break
      }
      case 'deleted_canvas':
        if (result.parentCanvasId) targetCanvasIds.add(result.parentCanvasId)
        break
      case 'renamed_node':
      case 'renamed_canvas':
        if (result.canvasId) targetCanvasIds.add(result.canvasId)
        if (result.parentCanvasId) targetCanvasIds.add(result.parentCanvasId)
        break
      default:
        return
    }

    if (targetCanvasIds.size === 0) return
    for (const canvasId of targetCanvasIds) await this.refreshCanvasMetadata(canvasId)
  }

  /**
   * `createDir` defaults to false: a live disk-driven refresh must never
   * resurrect a canvas directory that a rename/delete just removed (the `git
   * mv` ghost-sidecar defect). Only `materializeMissing` passes `true`.
   */
  async refreshCanvasMetadata(canvasId: string, options: { createDir?: boolean } = {}): Promise<void> {
    const canvas = this.findCanvasById(canvasId)
    if (!canvas) {
      this.log.debug({ canvasId }, 'Canvas missing during metadata refresh; skipping')
      return
    }
    const canvasPath = this.getCanvasPathById(canvasId)
    if (canvasPath === undefined) {
      this.log.warn({ canvasId }, 'Canvas path not found during metadata refresh')
      return
    }
    const metadata = buildCanvasMetadata(canvas)
    const canvasDir = canvasPath.length === 0 ? this.workspacePath : path.join(this.workspacePath, canvasPath)
    await this.writeMetadata(canvasDir, canvasPath, metadata, options.createDir ?? false)
  }

  /** Materialize sidecars only for canvases that lack one (non-destructive). */
  async materializeMissing(hasSidecar: (canvasPath: string) => Promise<boolean>): Promise<number> {
    let written = 0
    for (const canvasId of this.listCanvasIds()) {
      const canvasPath = this.getCanvasPathById(canvasId)
      if (canvasPath === undefined) continue
      if (await hasSidecar(canvasPath)) continue
      await this.refreshCanvasMetadata(canvasId, { createDir: true })
      written++
    }
    return written
  }
}
