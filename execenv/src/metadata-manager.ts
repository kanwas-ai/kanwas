import path from 'path'
import type { Logger } from 'pino'
import type { SyncResult } from 'shared/server'
import {
  collectAuditActors,
  resolveAuditIdentities,
  toMetadataAuditFields,
  type AuditIdentity,
  type CanvasItem,
  type CanvasMetadata,
  type NodeItem,
} from 'shared'
import { writeMetadataYaml } from './filesystem.js'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface MetadataManagerOptions {
  logger: Logger
  workspacePath: string
  findCanvasById: (canvasId: string) => CanvasItem | undefined
  getCanvasPathById: (canvasId: string) => string | undefined
  listCanvasIds: () => string[]
  resolveActorIdentity?: (actor: string) => Promise<AuditIdentity | null>
}

/**
 * MetadataManager rewrites metadata.yaml from canonical yDoc-backed state.
 */
export class MetadataManager {
  private readonly log: Logger
  private readonly workspacePath: string
  private readonly findCanvasById: MetadataManagerOptions['findCanvasById']
  private readonly getCanvasPathById: MetadataManagerOptions['getCanvasPathById']
  private readonly listCanvasIds: MetadataManagerOptions['listCanvasIds']
  private readonly resolveActorIdentity?: MetadataManagerOptions['resolveActorIdentity']

  constructor(options: MetadataManagerOptions) {
    this.log = options.logger.child({ component: 'MetadataManager' })
    this.workspacePath = options.workspacePath
    this.findCanvasById = options.findCanvasById
    this.getCanvasPathById = options.getCanvasPathById
    this.listCanvasIds = options.listCanvasIds
    this.resolveActorIdentity = options.resolveActorIdentity
  }

  async handleSyncResult(_absolutePath: string, result: SyncResult): Promise<void> {
    const targetCanvasIds = new Set<string>()

    for (const canvasId of result.affectedCanvasIds ?? []) {
      targetCanvasIds.add(canvasId)
    }

    switch (result.action) {
      case 'created_canvas':
        if (result.canvasId) {
          targetCanvasIds.add(result.canvasId)
        }
        if (result.parentCanvasId) {
          targetCanvasIds.add(result.parentCanvasId)
        }
        break

      case 'created_node':
      case 'deleted_node':
      case 'updated_content':
      case 'updated_binary_content':
      case 'updated_metadata': {
        if (result.action === 'updated_metadata' && !result.canvasChanged && result.changedNodeIds.length === 0) {
          return
        }

        if (result.canvasId) {
          targetCanvasIds.add(result.canvasId)
        }

        break
      }

      case 'deleted_canvas': {
        if (result.parentCanvasId) {
          targetCanvasIds.add(result.parentCanvasId)
        }

        break
      }

      case 'renamed_node':
      case 'renamed_canvas':
        if (result.canvasId) {
          targetCanvasIds.add(result.canvasId)
        }
        if (result.parentCanvasId) {
          targetCanvasIds.add(result.parentCanvasId)
        }
        break

      default:
        return
    }

    if (targetCanvasIds.size === 0) {
      this.log.warn(
        { action: result.action, canvasId: result.canvasId, parentCanvasId: result.parentCanvasId },
        'Missing canvas ID for metadata refresh'
      )
      return
    }

    for (const canvasId of targetCanvasIds) {
      await this.refreshCanvasMetadata(canvasId)
    }
  }

  async refreshCanvasMetadata(canvasId: string): Promise<void> {
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

    if (canvasPath.length === 0) {
      this.log.debug({ canvasId }, 'Skipping root canvas metadata refresh')
      return
    }

    const metadata = await this.buildCanvasMetadata(canvas)
    const canvasDir = path.join(this.workspacePath, canvasPath)
    await writeMetadataYaml(canvasDir, metadata)
  }

  async refreshAllCanvasMetadata(): Promise<void> {
    for (const canvasId of this.listCanvasIds()) {
      await this.refreshCanvasMetadata(canvasId)
    }
  }

  private async buildCanvasMetadata(canvas: CanvasItem): Promise<CanvasMetadata> {
    const nodeItems = canvas.items.filter((item): item is NodeItem => item.kind === 'node')

    const actorKeys = new Set<string>()
    collectAuditActors(canvas.xynode.data?.audit, actorKeys)
    for (const nodeItem of nodeItems) {
      collectAuditActors(nodeItem.xynode.data?.audit, actorKeys)
    }

    const resolvedActors = await resolveAuditIdentities(actorKeys, this.resolveActorIdentity)
    const canvasAudit = toMetadataAuditFields(canvas.xynode.data?.audit, resolvedActors)

    return {
      id: canvas.id,
      name: canvas.name,
      xynode: {
        position: { ...canvas.xynode.position },
        ...(canvas.xynode.measured ? { measured: { ...canvas.xynode.measured } } : {}),
        ...(canvasAudit ? { data: { audit: canvasAudit } } : {}),
      },
      edges: canvas.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
      nodes: nodeItems.map((nodeItem) => ({
        id: nodeItem.id,
        name: nodeItem.name,
        xynode: this.cloneNodeXynodeForMetadata(nodeItem.xynode, resolvedActors),
        ...(nodeItem.collapsed !== undefined ? { collapsed: nodeItem.collapsed } : {}),
        ...(nodeItem.summary !== undefined ? { summary: nodeItem.summary } : {}),
        ...(nodeItem.emoji !== undefined ? { emoji: nodeItem.emoji } : {}),
        ...(typeof (nodeItem.xynode.data as { sectionId?: string } | undefined)?.sectionId === 'string'
          ? { sectionId: (nodeItem.xynode.data as { sectionId?: string }).sectionId }
          : {}),
      })),
      ...(canvas.groups && canvas.groups.length > 0 ? { groups: canvas.groups } : {}),
      ...(canvas.sections && canvas.sections.length > 0 ? { sections: canvas.sections } : {}),
    }
  }

  private cloneNodeXynodeForMetadata(
    xynode: NodeItem['xynode'],
    resolved: Map<string, AuditIdentity | null>
  ): CanvasMetadata['nodes'][number]['xynode'] {
    const data = isObjectRecord(xynode.data) ? xynode.data : {}
    const auditSource = isObjectRecord(data.audit) ? data.audit : undefined
    const audit = toMetadataAuditFields(auditSource, resolved)

    return {
      id: xynode.id,
      type: xynode.type,
      position: { ...xynode.position },
      ...(xynode.measured ? { measured: { ...xynode.measured } } : {}),
      data: audit
        ? {
            ...data,
            audit,
          }
        : { ...data },
      ...(typeof xynode.width === 'number' ? { width: xynode.width } : {}),
      ...(typeof xynode.height === 'number' ? { height: xynode.height } : {}),
    }
  }
}
