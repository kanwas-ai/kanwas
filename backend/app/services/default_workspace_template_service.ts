import { inject } from '@adonisjs/core'
import drive from '@adonisjs/drive/services/main'
import { createHash } from 'node:crypto'
import { posix as pathPosix } from 'node:path'
import { DateTime } from 'luxon'
import {
  createWorkspaceContentStore,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  MAX_IMAGE_SIZE_BYTES,
  PathMapper,
  type CanvasItem,
  type ImageNodeData,
  type NodeItem,
  type WorkspaceDocument,
  type WorkspaceSnapshotBundle,
} from 'shared'
import { once } from 'shared'
import { createWorkspaceSnapshotBundle, hydrateWorkspaceSnapshotBundle } from 'shared/server'
import { createYjsProxy } from 'valtio-y'
import DefaultWorkspaceTemplate from '#models/default_workspace_template'
import { buildWorkspaceFileStoragePath, sanitizeStorageFilename } from '#services/workspace_file_storage'

const PORTABLE_TEMPLATE_VERSION = 1 as const
const KANWAS_SYSTEM_NODE_KIND = 'kanwas_md' as const

interface KanwasMarkerCandidate {
  node: NodeItem
  location: string
}

export interface PortableWorkspaceTemplateImageAsset {
  kind: 'image'
  nodeId: string
  filename: string
  mimeType: string
  size: number
  contentHash: string
  dataBase64: string
}

export type PortableWorkspaceTemplateAsset = PortableWorkspaceTemplateImageAsset

type BundledAssetKind = PortableWorkspaceTemplateAsset['kind']

interface BundledAssetRef {
  kind: BundledAssetKind
  node: NodeItem
  nodeId: string
  location: string
  canvasId: string
  storagePath: string
  mimeType: string
}

interface DecodedBundledAsset {
  asset: PortableWorkspaceTemplateAsset
  bytes: Buffer
}

interface PortableDocumentInspection {
  assetRefs: BundledAssetRef[]
}

interface BundledAssetHandler {
  kind: BundledAssetKind
  buildExportAsset: (reference: BundledAssetRef, pathMapper: PathMapper) => Promise<PortableWorkspaceTemplateAsset>
  decodeAsset: (asset: PortableWorkspaceTemplateAsset, index: number) => DecodedBundledAsset
  materializeAsset: (
    reference: BundledAssetRef,
    decoded: DecodedBundledAsset,
    workspaceId: string,
    usedStoragePaths: Set<string>,
    writtenStoragePaths: string[]
  ) => Promise<void>
}

export interface PortableWorkspaceTemplateFile {
  version: typeof PORTABLE_TEMPLATE_VERSION
  name: string
  exportedAt: string
  sourceWorkspaceId: string
  snapshot: WorkspaceSnapshotBundle
  assets?: PortableWorkspaceTemplateAsset[]
}

export interface MaterializedWorkspaceTemplateSnapshot {
  snapshot: WorkspaceSnapshotBundle
  assetStoragePaths: string[]
}

export interface DefaultWorkspaceTemplateMetadata {
  id: string
  name: string
  version: number
  sourceWorkspaceId: string | null
  exportedAt: string | null
  createdAt: string
  updatedAt: string
}

export class InvalidDefaultWorkspaceTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDefaultWorkspaceTemplateError'
  }
}

export class UnsupportedDefaultWorkspaceTemplateError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Portable workspace templates only support notes, text, sticky notes, links without preview images, images with bundled assets, and canvases.\n${issues.map((issue) => `- ${issue}`).join('\n')}`
    )
    this.name = 'UnsupportedDefaultWorkspaceTemplateError'
  }
}

@inject()
export default class DefaultWorkspaceTemplateService {
  private readonly bundledAssetHandlers: Record<BundledAssetKind, BundledAssetHandler> = {
    image: {
      kind: 'image',
      buildExportAsset: (reference, pathMapper) => this.buildImageExportAsset(reference, pathMapper),
      decodeAsset: (asset, index) => this.decodeImageAsset(asset as PortableWorkspaceTemplateImageAsset, index),
      materializeAsset: (reference, decoded, workspaceId, usedStoragePaths, writtenStoragePaths) =>
        this.materializeImageAsset(reference, decoded, workspaceId, usedStoragePaths, writtenStoragePaths),
    },
  }

  async getActiveSnapshotBundle(): Promise<WorkspaceSnapshotBundle | null> {
    const template = await this.getActiveTemplateRecord()
    return template?.snapshot ?? null
  }

  async buildActiveTemplateSnapshotForWorkspace(
    workspaceId: string
  ): Promise<MaterializedWorkspaceTemplateSnapshot | null> {
    const template = await this.getActiveTemplateRecord()
    if (!template) {
      return null
    }

    return this.materializeTemplateSnapshotForWorkspace(workspaceId, template.snapshot, template.assets ?? [])
  }

  async getActiveTemplateMetadata(): Promise<DefaultWorkspaceTemplateMetadata | null> {
    const template = await this.getActiveTemplateRecord()
    return template ? this.serializeMetadata(template) : null
  }

  async buildPortableTemplateFile(options: {
    workspaceId: string
    name: string
    snapshot: WorkspaceSnapshotBundle
  }): Promise<PortableWorkspaceTemplateFile> {
    let cleanup = () => {}

    try {
      const yDoc = hydrateWorkspaceSnapshotBundle(options.snapshot)
      const { proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
        getRoot: (doc) => doc.getMap('state'),
      })
      cleanup = once(() => {
        dispose()
        yDoc.destroy()
      })

      if (!proxy.root || proxy.root.kind !== 'canvas') {
        throw new InvalidDefaultWorkspaceTemplateError('Template snapshot must contain a root canvas')
      }

      const inspection = this.inspectPortableDocument(proxy.root, createWorkspaceContentStore(yDoc))
      const assets = await this.buildPortableAssets(proxy, inspection.assetRefs)

      return {
        version: PORTABLE_TEMPLATE_VERSION,
        name: options.name,
        exportedAt: new Date().toISOString(),
        sourceWorkspaceId: options.workspaceId,
        snapshot: options.snapshot,
        ...(assets.length > 0 ? { assets } : {}),
      }
    } catch (error) {
      if (
        error instanceof InvalidDefaultWorkspaceTemplateError ||
        error instanceof UnsupportedDefaultWorkspaceTemplateError
      ) {
        throw error
      }

      throw new InvalidDefaultWorkspaceTemplateError(
        error instanceof Error ? `Invalid template snapshot: ${error.message}` : 'Invalid template snapshot'
      )
    } finally {
      cleanup()
    }
  }

  parsePortableTemplateFile(payload: unknown): PortableWorkspaceTemplateFile {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new InvalidDefaultWorkspaceTemplateError('Template file must be a JSON object')
    }

    const candidate = payload as Record<string, unknown>
    const version = candidate.version
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    const exportedAt = typeof candidate.exportedAt === 'string' ? candidate.exportedAt.trim() : ''
    const sourceWorkspaceId = typeof candidate.sourceWorkspaceId === 'string' ? candidate.sourceWorkspaceId.trim() : ''

    if (version !== PORTABLE_TEMPLATE_VERSION) {
      throw new InvalidDefaultWorkspaceTemplateError(`Unsupported template version: ${String(version)}`)
    }

    if (!name) {
      throw new InvalidDefaultWorkspaceTemplateError('Template name is required')
    }

    if (!exportedAt || !DateTime.fromISO(exportedAt).isValid) {
      throw new InvalidDefaultWorkspaceTemplateError('Template exportedAt must be a valid ISO timestamp')
    }

    if (!sourceWorkspaceId) {
      throw new InvalidDefaultWorkspaceTemplateError('Template sourceWorkspaceId is required')
    }

    const snapshot = this.parseSnapshotBundle(candidate.snapshot)
    const assets = this.normalizeAndValidateTemplateAssets(snapshot, this.parseTemplateAssets(candidate.assets))

    return {
      version: PORTABLE_TEMPLATE_VERSION,
      name,
      exportedAt,
      sourceWorkspaceId,
      snapshot,
      ...(assets.length > 0 ? { assets } : {}),
    }
  }

  async replaceActiveTemplate(file: PortableWorkspaceTemplateFile): Promise<DefaultWorkspaceTemplate> {
    const exportedAt = DateTime.fromISO(file.exportedAt)
    if (!exportedAt.isValid) {
      throw new InvalidDefaultWorkspaceTemplateError('Template exportedAt must be a valid ISO timestamp')
    }

    const normalizedAssets = this.normalizeAndValidateTemplateAssets(file.snapshot, file.assets ?? [])

    let template = await this.getActiveTemplateRecord()

    if (!template) {
      template = await DefaultWorkspaceTemplate.create({
        name: file.name,
        version: file.version,
        snapshot: file.snapshot,
        assets: normalizedAssets,
        sourceWorkspaceId: file.sourceWorkspaceId,
        exportedAt,
      })
    } else {
      template.name = file.name
      template.version = file.version
      template.snapshot = file.snapshot
      template.assets = normalizedAssets
      template.sourceWorkspaceId = file.sourceWorkspaceId
      template.exportedAt = exportedAt
      await template.save()
    }

    await DefaultWorkspaceTemplate.query().whereNot('id', template.id).delete()
    return template
  }

  async clearActiveTemplate(): Promise<void> {
    await DefaultWorkspaceTemplate.query().delete()
  }

  serializeMetadata(template: DefaultWorkspaceTemplate): DefaultWorkspaceTemplateMetadata {
    return {
      id: template.id,
      name: template.name,
      version: template.version,
      sourceWorkspaceId: template.sourceWorkspaceId,
      exportedAt: template.exportedAt?.toISO() ?? null,
      createdAt: template.createdAt.toISO() ?? template.createdAt.toJSDate().toISOString(),
      updatedAt: template.updatedAt.toISO() ?? template.updatedAt.toJSDate().toISOString(),
    }
  }

  buildDownloadFilename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    return `${slug || 'workspace'}-template.json`
  }

  validatePortableSnapshot(snapshot: WorkspaceSnapshotBundle, assets: PortableWorkspaceTemplateAsset[] = []): void {
    const decodedAssets = this.decodeBundledAssets(assets)
    this.validatePortableSnapshotWithDecodedAssets(snapshot, decodedAssets)
  }

  private normalizeAndValidateTemplateAssets(
    snapshot: WorkspaceSnapshotBundle,
    assets: PortableWorkspaceTemplateAsset[]
  ): PortableWorkspaceTemplateAsset[] {
    const decodedAssets = this.decodeBundledAssets(assets)
    this.validatePortableSnapshotWithDecodedAssets(snapshot, decodedAssets)
    return Array.from(decodedAssets.values()).map((decoded) => decoded.asset)
  }

  private validatePortableSnapshotWithDecodedAssets(
    snapshot: WorkspaceSnapshotBundle,
    decodedAssets: Map<string, DecodedBundledAsset>
  ): void {
    let cleanup = () => {}

    try {
      const yDoc = hydrateWorkspaceSnapshotBundle(snapshot)
      const { proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
        getRoot: (doc) => doc.getMap('state'),
      })
      cleanup = once(() => {
        dispose()
        yDoc.destroy()
      })

      if (!proxy.root || proxy.root.kind !== 'canvas') {
        throw new InvalidDefaultWorkspaceTemplateError('Template snapshot must contain a root canvas')
      }

      const inspection = this.inspectPortableDocument(proxy.root, createWorkspaceContentStore(yDoc))
      this.validateAssetRefs(inspection.assetRefs, decodedAssets)
    } catch (error) {
      if (
        error instanceof InvalidDefaultWorkspaceTemplateError ||
        error instanceof UnsupportedDefaultWorkspaceTemplateError
      ) {
        throw error
      }

      throw new InvalidDefaultWorkspaceTemplateError(
        error instanceof Error ? `Invalid template snapshot: ${error.message}` : 'Invalid template snapshot'
      )
    } finally {
      cleanup()
    }
  }

  private async getActiveTemplateRecord(): Promise<DefaultWorkspaceTemplate | null> {
    return DefaultWorkspaceTemplate.query().orderBy('updated_at', 'desc').orderBy('id', 'desc').first()
  }

  private inspectPortableDocument(
    root: CanvasItem,
    contentStore: ReturnType<typeof createWorkspaceContentStore>
  ): PortableDocumentInspection {
    const issues: string[] = []
    const assetRefs: BundledAssetRef[] = []
    this.collectPortableTemplateIssues(root, [], issues, assetRefs)

    if (issues.length > 0) {
      throw new UnsupportedDefaultWorkspaceTemplateError(issues)
    }

    this.validateCanonicalKanwasMarker(root, contentStore)
    return { assetRefs }
  }

  private parseSnapshotBundle(snapshot: unknown): WorkspaceSnapshotBundle {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new InvalidDefaultWorkspaceTemplateError('Template snapshot must be an object')
    }

    const root = (snapshot as Record<string, unknown>).root
    const notes = (snapshot as Record<string, unknown>).notes

    if (typeof root !== 'string' || !root) {
      throw new InvalidDefaultWorkspaceTemplateError('Template snapshot.root must be a non-empty string')
    }

    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
      throw new InvalidDefaultWorkspaceTemplateError('Template snapshot.notes must be an object')
    }

    const parsedNotes: Record<string, string> = {}
    for (const [noteId, value] of Object.entries(notes)) {
      if (typeof value !== 'string') {
        throw new InvalidDefaultWorkspaceTemplateError(`Template snapshot note ${noteId} must be a string`)
      }

      parsedNotes[noteId] = value
    }

    return { root, notes: parsedNotes }
  }

  private parseTemplateAssets(value: unknown): PortableWorkspaceTemplateAsset[] {
    if (value === undefined || value === null) {
      return []
    }

    if (!Array.isArray(value)) {
      throw new InvalidDefaultWorkspaceTemplateError('Template assets must be an array')
    }

    return value.map((asset, index) => this.parseTemplateAsset(asset, index))
  }

  private parseTemplateAsset(value: unknown, index: number): PortableWorkspaceTemplateAsset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${index} must be an object`)
    }

    const candidate = value as Record<string, unknown>
    if (candidate.kind !== 'image') {
      throw new UnsupportedDefaultWorkspaceTemplateError([
        `Template asset ${index} uses unsupported kind "${String(candidate.kind)}"`,
      ])
    }

    const nodeId = typeof candidate.nodeId === 'string' ? candidate.nodeId.trim() : ''
    const filename = typeof candidate.filename === 'string' ? candidate.filename.trim() : ''
    const mimeType = typeof candidate.mimeType === 'string' ? candidate.mimeType.trim() : ''
    const contentHash = typeof candidate.contentHash === 'string' ? candidate.contentHash.trim() : ''
    const dataBase64 = typeof candidate.dataBase64 === 'string' ? candidate.dataBase64.trim() : ''
    const size = candidate.size

    if (!nodeId) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${index} nodeId is required`)
    }

    if (!filename || filename.includes('/') || filename.includes('\\')) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${index} filename is required`)
    }

    if (!dataBase64) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${index} dataBase64 is required`)
    }

    return {
      kind: 'image',
      nodeId,
      filename,
      mimeType,
      size: Number.isSafeInteger(size) && (size as number) > 0 ? (size as number) : 0,
      contentHash,
      dataBase64,
    }
  }

  private collectPortableTemplateIssues(
    canvas: CanvasItem,
    canvasPath: string[],
    issues: string[],
    assetRefs: BundledAssetRef[]
  ): void {
    const nextPath = canvas.id === 'root' ? canvasPath : [...canvasPath, canvas.name || canvas.id]

    for (const item of canvas.items) {
      if (item.kind === 'canvas') {
        this.collectPortableTemplateIssues(item, nextPath, issues, assetRefs)
        continue
      }

      this.collectNodeIssue(item, canvas.id, nextPath, issues, assetRefs)
    }
  }

  private validateCanonicalKanwasMarker(
    root: CanvasItem,
    contentStore: ReturnType<typeof createWorkspaceContentStore>
  ): void {
    const markerCandidates: KanwasMarkerCandidate[] = []
    const invalidMarkerCandidates: KanwasMarkerCandidate[] = []

    this.collectKanwasMarkerCandidates(root, [], markerCandidates, invalidMarkerCandidates)

    if (invalidMarkerCandidates.length > 0) {
      const [firstInvalid] = invalidMarkerCandidates
      throw new InvalidDefaultWorkspaceTemplateError(
        `Template snapshot must mark a blockNote instructions note with systemNodeKind "${KANWAS_SYSTEM_NODE_KIND}", found ${firstInvalid.node.xynode.type} at ${firstInvalid.location}`
      )
    }

    if (markerCandidates.length !== 1) {
      throw new InvalidDefaultWorkspaceTemplateError(
        `Template snapshot must contain exactly one canonical instructions note marked with systemNodeKind "${KANWAS_SYSTEM_NODE_KIND}"; found ${markerCandidates.length}`
      )
    }

    const [marker] = markerCandidates
    if (!contentStore.getBlockNoteFragment(marker.node.id)) {
      throw new InvalidDefaultWorkspaceTemplateError(
        `Template snapshot canonical instructions note at ${marker.location} is missing its note fragment`
      )
    }
  }

  private collectKanwasMarkerCandidates(
    canvas: CanvasItem,
    canvasPath: string[],
    markerCandidates: KanwasMarkerCandidate[],
    invalidMarkerCandidates: KanwasMarkerCandidate[]
  ): void {
    const nextPath = canvas.id === 'root' ? canvasPath : [...canvasPath, canvas.name || canvas.id]

    for (const item of canvas.items) {
      if (item.kind === 'canvas') {
        this.collectKanwasMarkerCandidates(item, nextPath, markerCandidates, invalidMarkerCandidates)
        continue
      }

      if (this.readSystemNodeKind(item) !== KANWAS_SYSTEM_NODE_KIND) {
        continue
      }

      const candidate = { node: item, location: this.buildNodeLocation(item, nextPath) }
      if (item.xynode.type === 'blockNote') {
        markerCandidates.push(candidate)
      } else {
        invalidMarkerCandidates.push(candidate)
      }
    }
  }

  private readSystemNodeKind(node: NodeItem): string | null {
    const data = node.xynode.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null
    }

    return typeof (data as Record<string, unknown>).systemNodeKind === 'string'
      ? ((data as Record<string, unknown>).systemNodeKind as string)
      : null
  }

  private buildNodeLocation(node: NodeItem, canvasPath: string[]): string {
    return `/${[...canvasPath, node.name || node.id].join('/')}`
  }

  private collectNodeIssue(
    node: NodeItem,
    canvasId: string,
    canvasPath: string[],
    issues: string[],
    assetRefs: BundledAssetRef[]
  ): void {
    const location = this.buildNodeLocation(node, canvasPath)

    switch (node.xynode.type) {
      case 'blockNote':
      case 'text':
      case 'stickyNote':
        return
      case 'link':
        if (node.xynode.data.imageStoragePath) {
          issues.push(`${location} uses a link preview image, which is not portable between environments`)
        }
        return
      case 'image':
        this.collectBundledAssetRef(node, canvasId, canvasPath, assetRefs)
        return
      case 'file':
      case 'audio':
        issues.push(`${location} uses unsupported node type "${node.xynode.type}"`)
        return
      default:
        issues.push(`${location} uses unsupported node type "${node.xynode.type}"`)
    }
  }

  private collectBundledAssetRef(
    node: NodeItem,
    canvasId: string,
    canvasPath: string[],
    assetRefs: BundledAssetRef[]
  ): void {
    const location = this.buildNodeLocation(node, canvasPath)
    const data = node.xynode.data as Partial<ImageNodeData>
    const storagePath = typeof data.storagePath === 'string' ? data.storagePath : ''
    const mimeType = typeof data.mimeType === 'string' ? data.mimeType : ''

    assetRefs.push({
      kind: 'image',
      node,
      nodeId: node.id,
      location,
      canvasId,
      storagePath,
      mimeType,
    })
  }

  private validateAssetRefs(assetRefs: BundledAssetRef[], decodedAssets: Map<string, DecodedBundledAsset>): void {
    const issues: string[] = []
    const referencedNodeIds = new Set<string>()

    for (const reference of assetRefs) {
      const decoded = decodedAssets.get(reference.nodeId)
      if (!decoded) {
        issues.push(
          `${reference.location} ${reference.kind} node is missing bundled ${reference.kind} asset ${reference.nodeId}`
        )
        continue
      }

      if (decoded.asset.kind !== reference.kind) {
        issues.push(
          `${reference.location} ${reference.kind} node is matched to incompatible ${decoded.asset.kind} asset ${reference.nodeId}`
        )
        continue
      }

      referencedNodeIds.add(reference.nodeId)
    }

    for (const decoded of decodedAssets.values()) {
      if (!referencedNodeIds.has(decoded.asset.nodeId)) {
        issues.push(
          `Bundled ${decoded.asset.kind} asset ${decoded.asset.nodeId} is not referenced by an ${decoded.asset.kind} node`
        )
      }
    }

    if (issues.length > 0) {
      throw new UnsupportedDefaultWorkspaceTemplateError(issues)
    }
  }

  private async buildPortableAssets(
    proxy: WorkspaceDocument,
    references: BundledAssetRef[]
  ): Promise<PortableWorkspaceTemplateAsset[]> {
    const pathMapper = new PathMapper()
    pathMapper.buildFromWorkspace(proxy)

    const assets: PortableWorkspaceTemplateAsset[] = []
    const seenNodeIds = new Set<string>()
    const issues: string[] = []

    for (const reference of references) {
      if (seenNodeIds.has(reference.nodeId)) {
        continue
      }

      seenNodeIds.add(reference.nodeId)
      try {
        assets.push(await this.getBundledAssetHandler(reference.kind).buildExportAsset(reference, pathMapper))
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error))
      }
    }

    if (issues.length > 0) {
      throw new UnsupportedDefaultWorkspaceTemplateError(issues)
    }

    return assets
  }

  private async buildImageExportAsset(
    reference: BundledAssetRef,
    pathMapper: PathMapper
  ): Promise<PortableWorkspaceTemplateImageAsset> {
    if (!reference.storagePath) {
      throw new Error(`${reference.location} image node is missing storagePath`)
    }

    const filename = this.getExportFilenameForAssetRef(pathMapper, reference)
    const mimeType = this.resolveImageAssetMimeType(
      {
        filename,
        mimeType: reference.mimeType,
      },
      reference.location
    )

    try {
      const bytes = Buffer.from(await drive.use().getBytes(reference.storagePath))
      return {
        kind: 'image',
        nodeId: reference.nodeId,
        filename,
        mimeType,
        size: bytes.byteLength,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        dataBase64: bytes.toString('base64'),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${reference.location} image asset ${reference.storagePath} could not be read: ${message}`)
    }
  }

  private getExportFilenameForAssetRef(pathMapper: PathMapper, reference: BundledAssetRef): string {
    const mappedPath = pathMapper.getPathForNode(reference.nodeId)
    if (!mappedPath) {
      throw new Error(`${reference.location} ${reference.kind} node could not be mapped to an export filename`)
    }

    const filename = pathPosix.basename(mappedPath)
    if (!filename) {
      throw new Error(`${reference.location} ${reference.kind} node mapped to an empty export filename`)
    }

    return filename
  }

  private decodeBundledAssets(assets: PortableWorkspaceTemplateAsset[]): Map<string, DecodedBundledAsset> {
    const decodedAssets = new Map<string, DecodedBundledAsset>()

    for (const [index, asset] of assets.entries()) {
      const kind = (asset as { kind?: unknown }).kind
      if (kind !== 'image') {
        throw new UnsupportedDefaultWorkspaceTemplateError([
          `Template asset ${index} uses unsupported kind "${String(kind)}"`,
        ])
      }

      if (decodedAssets.has(asset.nodeId)) {
        throw new InvalidDefaultWorkspaceTemplateError(
          `Template has duplicate bundled ${asset.kind} asset ${asset.nodeId}`
        )
      }

      decodedAssets.set(asset.nodeId, this.getBundledAssetHandler(asset.kind).decodeAsset(asset, index))
    }

    return decodedAssets
  }

  private getBundledAssetHandler(kind: BundledAssetKind): BundledAssetHandler {
    return this.bundledAssetHandlers[kind]
  }

  private decodeImageAsset(asset: PortableWorkspaceTemplateImageAsset, index: number): DecodedBundledAsset {
    if (!asset.nodeId || !asset.filename || !asset.dataBase64) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${index} is missing required image fields`)
    }

    if (asset.filename.includes('/') || asset.filename.includes('\\')) {
      throw new InvalidDefaultWorkspaceTemplateError(
        `Template asset ${index} filename must not contain path separators`
      )
    }

    const bytes = this.decodeStrictBase64(asset.dataBase64, index)

    if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
      throw new InvalidDefaultWorkspaceTemplateError(
        `Template asset ${index} exceeds the ${MAX_IMAGE_SIZE_BYTES} byte image limit`
      )
    }

    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const mimeType = this.resolveImageAssetMimeType(asset, `Template asset ${index}`)

    return {
      asset: {
        ...asset,
        mimeType,
        size: bytes.byteLength,
        contentHash,
      },
      bytes,
    }
  }

  private resolveImageAssetMimeType(
    asset: Pick<PortableWorkspaceTemplateImageAsset, 'filename'> & { mimeType?: string },
    label: string
  ): string {
    const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType.trim() : ''
    const extension = pathPosix.extname(asset.filename).slice(1)
    const inferredMimeType = extension ? getMimeTypeFromExtension(extension) : undefined

    if (extension && !inferredMimeType) {
      throw new InvalidDefaultWorkspaceTemplateError(
        `${label} must use a supported image MIME type or filename extension`
      )
    }

    if (mimeType && getExtensionFromMimeType(mimeType)) {
      return mimeType
    }

    if (inferredMimeType) {
      return inferredMimeType
    }

    throw new InvalidDefaultWorkspaceTemplateError(
      `${label} must use a supported image MIME type or filename extension`
    )
  }

  private decodeStrictBase64(value: string, assetIndex: number): Buffer {
    const normalized = value.trim()

    if (
      !normalized ||
      normalized.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) ||
      /=[^=]/.test(normalized)
    ) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${assetIndex} dataBase64 must be valid base64`)
    }

    const bytes = Buffer.from(normalized, 'base64')
    if (bytes.toString('base64') !== normalized) {
      throw new InvalidDefaultWorkspaceTemplateError(`Template asset ${assetIndex} dataBase64 must be valid base64`)
    }

    return bytes
  }

  async materializeTemplateSnapshotForWorkspace(
    workspaceId: string,
    snapshot: WorkspaceSnapshotBundle,
    assets: PortableWorkspaceTemplateAsset[]
  ): Promise<MaterializedWorkspaceTemplateSnapshot> {
    const decodedAssets = this.decodeBundledAssets(assets)

    let cleanup = () => {}
    const writtenStoragePaths: string[] = []

    try {
      const yDoc = hydrateWorkspaceSnapshotBundle(snapshot)
      const { proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
        getRoot: (doc) => doc.getMap('state'),
      })
      cleanup = once(() => {
        dispose()
        yDoc.destroy()
      })

      if (!proxy.root || proxy.root.kind !== 'canvas') {
        throw new InvalidDefaultWorkspaceTemplateError('Template snapshot must contain a root canvas')
      }

      const inspection = this.inspectPortableDocument(proxy.root, createWorkspaceContentStore(yDoc))
      this.validateAssetRefs(inspection.assetRefs, decodedAssets)

      if (decodedAssets.size === 0) {
        return { snapshot, assetStoragePaths: [] }
      }

      await this.materializeBundledAssets(inspection.assetRefs, workspaceId, decodedAssets, writtenStoragePaths)

      return {
        snapshot: createWorkspaceSnapshotBundle(yDoc),
        assetStoragePaths: writtenStoragePaths,
      }
    } catch (error) {
      await this.deleteTemplateAssetFiles(writtenStoragePaths)
      throw error
    } finally {
      cleanup()
    }
  }

  async deleteTemplateAssetFiles(storagePaths: string[]): Promise<void> {
    await Promise.allSettled(storagePaths.map((storagePath) => drive.use().delete(storagePath)))
  }

  private async materializeBundledAssets(
    assetRefs: BundledAssetRef[],
    workspaceId: string,
    decodedAssets: Map<string, DecodedBundledAsset>,
    writtenStoragePaths: string[]
  ): Promise<void> {
    const usedStoragePaths = new Set<string>()

    for (const reference of assetRefs) {
      const decoded = decodedAssets.get(reference.nodeId)
      if (!decoded) {
        throw new InvalidDefaultWorkspaceTemplateError(
          `Template ${reference.kind} node ${reference.node.name || reference.nodeId} is missing bundled asset ${reference.nodeId}`
        )
      }

      await this.getBundledAssetHandler(reference.kind).materializeAsset(
        reference,
        decoded,
        workspaceId,
        usedStoragePaths,
        writtenStoragePaths
      )
    }
  }

  private async materializeImageAsset(
    reference: BundledAssetRef,
    decoded: DecodedBundledAsset,
    workspaceId: string,
    usedStoragePaths: Set<string>,
    writtenStoragePaths: string[]
  ): Promise<void> {
    const asset = decoded.asset as PortableWorkspaceTemplateImageAsset
    const storagePath = this.buildMaterializedAssetStoragePath(
      workspaceId,
      reference.canvasId,
      asset.filename,
      'image',
      usedStoragePaths
    )

    await drive.use().put(storagePath, decoded.bytes, { contentType: asset.mimeType })
    writtenStoragePaths.push(storagePath)

    const data = reference.node.xynode.data as ImageNodeData
    reference.node.xynode.data = {
      ...data,
      storagePath,
      mimeType: asset.mimeType,
      size: asset.size,
      contentHash: asset.contentHash,
    }
  }

  private buildMaterializedAssetStoragePath(
    workspaceId: string,
    canvasId: string,
    filename: string,
    fallbackFilename: string,
    usedStoragePaths: Set<string>
  ): string {
    const safeFilename = sanitizeStorageFilename(filename) || fallbackFilename
    const extension = pathPosix.extname(safeFilename)
    const basename = extension ? safeFilename.slice(0, -extension.length) : safeFilename

    let candidateFilename = safeFilename
    let storagePath = buildWorkspaceFileStoragePath(workspaceId, canvasId, candidateFilename, fallbackFilename)
    let counter = 1

    while (usedStoragePaths.has(storagePath)) {
      candidateFilename = `${basename || fallbackFilename}-${counter}${extension}`
      storagePath = buildWorkspaceFileStoragePath(workspaceId, canvasId, candidateFilename, fallbackFilename)
      counter += 1
    }

    usedStoragePaths.add(storagePath)
    return storagePath
  }
}
