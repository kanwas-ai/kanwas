import fs from 'fs/promises'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
import WebSocket from 'ws'
import type { Logger } from 'pino'
import {
  workspaceToFilesystem,
  FilesystemSyncer,
  ContentConverter,
  BINARY_FILE_TYPES,
  type SyncResult,
} from 'shared/server'
import {
  connectToWorkspace,
  PathMapper,
  parseFileSection,
  parseAuditActor,
  type AuditIdentity,
  type CanvasMetadata,
  type WorkspaceConnection,
  type CanvasItem,
  type FileSection,
  type NodeItem,
  type SectionDef,
  type SectionLayout,
} from 'shared'
import {
  initializeApiClient,
  fetchCurrentUser,
  fetchFileBinary,
  fetchWorkspaceMembers,
  fetchYjsSocketToken,
  uploadFile,
} from './api.js'
import {
  writeFSNode,
  clearDirectory,
  writeReadyMarker,
  readFileContent,
  readFileBinary,
  isDirectory,
  readMetadataYaml,
  writeMetadataYaml,
} from './filesystem.js'
import { MetadataManager } from './metadata-manager.js'
import { mergeMarkdown3Way } from './markdown-merge.js'
import { withCorrelationId } from './logger.js'
import type { ApplySectionChange, FileAnchorPlacementResolution } from './live-state-server.js'

const KANWAS_SYSTEM_NODE_KIND = 'kanwas_md' as const
const PLACEMENT_ROOT = '/tmp/kanwas-placement'
const INTERNAL_WRITE_SUPPRESSION_TTL_MS = 15_000
const ACTOR_IDENTITY_CACHE_TTL_MS = 30_000
const METADATA_RETRY_BASE_DELAY_MS = 1_000
const METADATA_RETRY_MAX_DELAY_MS = 30_000
const METADATA_RETRY_MAX_ATTEMPTS = 5
const CREATE_SECTION_LOCATION_ERROR =
  'create_section now requires location. Use location: { mode: "position", x, y } or location: { mode: "after" | "below", anchorSectionId, gap? }.'

interface InternalWriteSuppression {
  hash: string
  expiresAt: number
  reason: string
}

interface MarkdownPreflightResult {
  shortCircuitResult?: SyncResult
  contentOverride?: string
  writebackContentAfterSync?: string
}

interface CachedActorIdentity {
  value: AuditIdentity | null
  expiresAt: number
}

interface CachedWorkspaceMembers {
  members: Array<{ id: string; name: string | null; email: string | null }>
  expiresAt: number
}

interface PlacementIntentEnvelope {
  section?: FileSection
}

interface MetadataRetryTask {
  canvasId: string
  attempts: number
  nextRunAt: number
  lastError: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeWorkspacePath(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\/+/, '')
  if (!normalized || normalized.includes('\0') || normalized.split('/').some((segment) => segment === '..')) {
    throw new Error(`Invalid path: ${value}`)
  }

  return normalized
}

function normalizeRequiredApplyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string.`)
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string.`)
  }

  return normalized
}

function parseSectionLayout(value: unknown): SectionLayout {
  if (value !== 'horizontal' && value !== 'grid') {
    throw new Error('Section layout must be horizontal or grid.')
  }

  return value
}

function parseColumns(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Section columns must be a positive integer.')
  }

  return value
}

function parseNonEmptyPathList(paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('paths must be a non-empty array.')
  }

  return paths.map((pathValue) => normalizeRequiredApplyString(pathValue, 'path'))
}

function normalizeSectionColumns(section: SectionDef): void {
  if (section.layout !== 'grid') {
    delete section.columns
  } else if (section.columns !== undefined) {
    section.columns = parseColumns(section.columns)
  }
}

function cloneCanvasMetadataForSectionChanges(metadata: CanvasMetadata): CanvasMetadata {
  return {
    ...metadata,
    xynode: { ...metadata.xynode, data: metadata.xynode?.data ? { ...metadata.xynode.data } : metadata.xynode?.data },
    edges: [...(metadata.edges ?? [])],
    nodes: (metadata.nodes ?? []).map((node) => ({
      ...node,
      xynode: {
        ...node.xynode,
        data: { ...(node.xynode?.data ?? {}) },
      },
    })),
    groups: metadata.groups?.map((group) => ({
      ...group,
      position: { ...group.position },
      memberIds: [...group.memberIds],
    })),
    sections: metadata.sections?.map((section) => ({
      ...section,
      position: { ...section.position },
      memberIds: [...section.memberIds],
      pendingPlacement: section.pendingPlacement ? { ...section.pendingPlacement } : undefined,
    })),
  }
}

function resolveCreatedSectionPosition(
  change: Extract<ApplySectionChange, { type: 'create_section' }>,
  sections: SectionDef[]
): { x: number; y: number } {
  const legacyChange = change as { position?: unknown; placement?: unknown }
  if (legacyChange.position !== undefined || legacyChange.placement !== undefined || change.location === undefined) {
    throw new Error(CREATE_SECTION_LOCATION_ERROR)
  }

  if (change.location.mode === 'position') {
    const { x, y } = change.location
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      throw new Error('create_section.location with mode position must contain numeric x/y.')
    }

    return { x, y }
  }

  if (change.location.mode !== 'after' && change.location.mode !== 'below') {
    throw new Error(CREATE_SECTION_LOCATION_ERROR)
  }

  const anchorSectionId = normalizeRequiredApplyString(change.location.anchorSectionId, 'anchorSectionId')
  const anchorSection = sections.find((section) => section.id === anchorSectionId)
  if (!anchorSection) {
    throw new Error(`Section not found: ${anchorSectionId}`)
  }

  return { x: 0, y: 0 }
}

function resolveCreatedSectionPendingPlacement(
  change: Extract<ApplySectionChange, { type: 'create_section' }>,
  sections: SectionDef[]
): { mode: 'after' | 'below'; anchorSectionId: string; gap?: number } | undefined {
  if (!change.location || change.location.mode === 'position') {
    return undefined
  }

  if (change.location.mode !== 'after' && change.location.mode !== 'below') {
    throw new Error(CREATE_SECTION_LOCATION_ERROR)
  }

  if (
    change.location.gap !== undefined &&
    (typeof change.location.gap !== 'number' || !Number.isFinite(change.location.gap) || change.location.gap < 0)
  ) {
    throw new Error('create_section.location.gap must be a non-negative number.')
  }

  const anchorSectionId = normalizeRequiredApplyString(change.location.anchorSectionId, 'anchorSectionId')
  const anchorSection = sections.find((section) => section.id === anchorSectionId)
  if (!anchorSection) {
    throw new Error(`Section not found: ${anchorSectionId}`)
  }

  return {
    mode: change.location.mode,
    anchorSectionId: anchorSection.id,
    ...(change.location.gap !== undefined ? { gap: change.location.gap } : {}),
  }
}

function syncNodeSectionIds(metadata: CanvasMetadata, sections: SectionDef[]): void {
  const sectionIdByNodeId = new Map<string, string>()
  for (const section of sections) {
    for (const memberId of section.memberIds) {
      sectionIdByNodeId.set(memberId, section.id)
    }
  }

  metadata.nodes = metadata.nodes.map((node) => {
    const sectionId = sectionIdByNodeId.get(node.id)
    if (sectionId) {
      return { ...node, sectionId }
    }

    const nextNode = { ...node }
    delete nextNode.sectionId
    return nextNode
  })
}

export interface SyncManagerOptions {
  /** Workspace ID for Yjs server connection */
  workspaceId: string
  /** Yjs server host (e.g., "localhost:1999") */
  yjsServerHost?: string
  /** Path to workspace directory on disk */
  workspacePath: string
  /** Protocol for WebSocket connection (ws or wss) - defaults to ws */
  protocol?: 'ws' | 'wss'
  /** Backend API URL for file operations */
  backendUrl: string
  /** Auth token for backend API */
  authToken: string
  /** Canonical user ID used for agent audit attribution */
  userId: string
  /** Logger instance */
  logger: Logger
}

/**
 * SyncManager orchestrates bidirectional sync between filesystem and the Yjs server workspace.
 *
 * It:
 * 1. Connects to the Yjs server and maintains the connection
 * 2. Hydrates the filesystem with workspace data
 * 3. Handles file changes and syncs them back to Yjs
 */
export class SyncManager {
  private readonly options: SyncManagerOptions
  private readonly log: Logger
  private connection: WorkspaceConnection | null = null
  private pathMapper: PathMapper | null = null
  private syncer: FilesystemSyncer | null = null
  private contentConverter: ContentConverter | null = null
  private metadataManager: MetadataManager | null = null
  /**
   * Queue to serialize file change handling.
   *
   * Concurrent file changes can cause read-modify-write races on metadata.yaml.
   * By serializing through this queue, each change is fully processed before
   * the next one starts, preventing duplicates and data loss.
   */
  private fileChangeQueue: Promise<SyncResult | undefined> = Promise.resolve(undefined)
  private markdownShadowByNodeId = new Map<string, string>()
  private internalWriteSuppressionsByPath = new Map<string, InternalWriteSuppression[]>()
  private actorIdentityCache = new Map<string, CachedActorIdentity>()
  private workspaceMembersCache: CachedWorkspaceMembers | null = null
  private currentUserCache: { value: { id: string; name: string; email: string }; expiresAt: number } | null = null
  private hydrationHadIdentityLookupFailure = false
  private metadataRetryTasks = new Map<string, MetadataRetryTask>()
  private metadataRetryTimer: NodeJS.Timeout | null = null
  private metadataRetryWorkerRunning = false
  private cachedSocketToken: { token: string; expiresAtMs: number } | null = null

  async waitForSectionInCanvas(input: { relativePath: string; title: string; timeoutMs: number }): Promise<boolean> {
    const deadline = Date.now() + input.timeoutMs

    while (true) {
      if (this.hasSectionInCanvas(input.relativePath, input.title)) {
        return true
      }

      if (Date.now() >= deadline) {
        return false
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  async resolveFileAnchorPlacement(input: {
    targetRelativePath: string
    anchorFilePath: string
    fallbackSectionTitle: string
    timeoutMs: number
  }): Promise<FileAnchorPlacementResolution> {
    const deadline = Date.now() + input.timeoutMs

    while (true) {
      const placement = this.resolveFileAnchorPlacementSnapshot(input)
      if (placement.exists || placement.error) {
        return placement
      }

      if (Date.now() >= deadline) {
        return placement
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  async getFileSectionMembership(input: {
    relativePath: string
  }): Promise<{ sectionTitle: string | null; memberCount: number | null }> {
    const relativePath = input.relativePath.trim().replace(/^\/+/, '')
    if (!relativePath || !this.connection?.proxy.root || !this.pathMapper) {
      return { sectionTitle: null, memberCount: null }
    }

    const mapping = this.pathMapper.getMapping(relativePath)
    if (!mapping) {
      return { sectionTitle: null, memberCount: null }
    }

    const canvas = this.findCanvasById(this.connection.proxy.root, mapping.canvasId)
    if (!canvas) {
      return { sectionTitle: null, memberCount: null }
    }

    const section = (canvas.sections ?? []).find((candidate) => candidate.memberIds.includes(mapping.nodeId))
    if (!section) {
      return { sectionTitle: null, memberCount: null }
    }

    return {
      sectionTitle: section.title,
      memberCount: section.memberIds.length,
    }
  }

  async applySectionChanges(input: {
    canvasPath: string
    changes: ApplySectionChange[]
  }): Promise<{ paths: string[] }> {
    if (!Array.isArray(input.changes) || input.changes.length === 0) {
      throw new Error('changes must be a non-empty array.')
    }

    if (!this.pathMapper) {
      throw new Error('Path mapper is not initialized.')
    }

    const normalizedCanvasPath = this.normalizeCanvasPath(input.canvasPath)
    const absoluteCanvasPath = this.resolveCanvasDirectory(normalizedCanvasPath)
    const canvasMapping = this.pathMapper.getCanvasMapping(normalizedCanvasPath)
    if (!canvasMapping) {
      throw new Error(`Canvas not found: ${input.canvasPath}`)
    }

    if (!(await isDirectory(absoluteCanvasPath))) {
      throw new Error(`Canvas not found: ${input.canvasPath}`)
    }

    const metadata = await readMetadataYaml(absoluteCanvasPath)
    if (!metadata) {
      throw new Error(`Canvas metadata not found: ${input.canvasPath}`)
    }

    if (metadata.id && metadata.id !== canvasMapping.canvasId) {
      throw new Error(`Canvas metadata ID mismatch: ${input.canvasPath}`)
    }

    const nextMetadata = cloneCanvasMetadataForSectionChanges(metadata)
    if (!Array.isArray(nextMetadata.nodes)) {
      throw new Error('Canvas metadata nodes must be an array.')
    }

    let sections = [...(nextMetadata.sections ?? [])]
    const changedPaths: string[] = []
    const seenPaths = new Set<string>()
    const pendingPlacementBySectionId = new Map<
      string,
      { mode: 'after' | 'below'; anchorSectionId: string; gap?: number }
    >()

    const findSection = (sectionId: string): SectionDef => {
      const section = sections.find((candidate) => candidate.id === sectionId)
      if (!section) {
        throw new Error(`Section not found: ${sectionId}`)
      }

      return section
    }

    const assertUniqueTitle = (title: string, ignoreSectionId?: string): void => {
      if (sections.some((section) => section.id !== ignoreSectionId && section.title === title)) {
        throw new Error(`Section already exists: ${title}`)
      }
    }

    const getNodeIdForPath = (rawPath: string): string => {
      const relativePath = normalizeWorkspacePath(rawPath)
      if (seenPaths.has(relativePath)) {
        throw new Error(`Duplicate path: ${relativePath}`)
      }
      seenPaths.add(relativePath)

      const mapping = this.pathMapper!.getMapping(relativePath)
      if (!mapping) {
        throw new Error(`File not found: ${relativePath}`)
      }

      if (mapping.canvasId !== canvasMapping.canvasId) {
        throw new Error(`File belongs to a different canvas: ${relativePath}`)
      }

      const node = nextMetadata.nodes.find((candidate) => candidate.id === mapping.nodeId)
      if (!node) {
        throw new Error(`Node not found in metadata for file: ${relativePath}`)
      }

      changedPaths.push(relativePath)
      return mapping.nodeId
    }

    const removeNodeFromSections = (nodeId: string): void => {
      sections = sections.map((section) => ({
        ...section,
        memberIds: section.memberIds.filter((memberId) => memberId !== nodeId),
      }))
    }

    const pruneEmptySections = (): void => {
      sections = sections.filter((section) => section.memberIds.length > 0)
    }

    const assignNodesToSection = (sectionId: string, nodeIds: string[]): void => {
      const target = findSection(sectionId)
      for (const nodeId of nodeIds) {
        removeNodeFromSections(nodeId)
      }

      const refreshedTarget = findSection(target.id)
      refreshedTarget.memberIds = [
        ...refreshedTarget.memberIds.filter((memberId) => !nodeIds.includes(memberId)),
        ...nodeIds,
      ]
      pruneEmptySections()
    }

    for (const change of input.changes) {
      if (!isObjectRecord(change) || typeof change.type !== 'string') {
        throw new Error('Invalid section change.')
      }

      if (change.type === 'update_section') {
        const sectionId = normalizeRequiredApplyString(change.sectionId, 'sectionId')
        const section = findSection(sectionId)
        let changed = false

        if (change.title !== undefined) {
          const title = normalizeRequiredApplyString(change.title, 'title')
          assertUniqueTitle(title, sectionId)
          section.title = title
          changed = true
        }

        if (change.layout !== undefined) {
          section.layout = parseSectionLayout(change.layout)
          changed = true
        }

        if (change.columns !== undefined) {
          section.columns = parseColumns(change.columns)
          changed = true
        }

        if (change.columns !== undefined && section.layout !== 'grid') {
          throw new Error('Section columns can only be set when layout is grid.')
        }

        if (!changed) {
          throw new Error('update_section requires title, layout, or columns.')
        }

        normalizeSectionColumns(section)
        continue
      }

      if (change.type === 'move_files') {
        const sectionId = normalizeRequiredApplyString(change.sectionId, 'sectionId')
        findSection(sectionId)
        const nodeIds = parseNonEmptyPathList(change.paths).map(getNodeIdForPath)
        assignNodesToSection(sectionId, nodeIds)
        continue
      }

      if (change.type === 'create_section') {
        const title = normalizeRequiredApplyString(change.title, 'title')
        assertUniqueTitle(title)
        const layout = parseSectionLayout(change.layout)
        if (change.columns !== undefined && layout !== 'grid') {
          throw new Error('Section columns can only be set when layout is grid.')
        }
        const position = resolveCreatedSectionPosition(change, sections)
        const nodeIds = parseNonEmptyPathList(change.paths).map(getNodeIdForPath)
        const pendingPlacement = resolveCreatedSectionPendingPlacement(change, sections)
        const nextSection: SectionDef = {
          id: randomUUID(),
          title,
          layout,
          position,
          memberIds: [],
          ...(change.columns !== undefined ? { columns: parseColumns(change.columns) } : {}),
        }
        normalizeSectionColumns(nextSection)
        sections.push(nextSection)
        if (pendingPlacement) {
          pendingPlacementBySectionId.set(nextSection.id, pendingPlacement)
        }
        assignNodesToSection(nextSection.id, nodeIds)
        continue
      }

      throw new Error(`Unsupported section change type: ${(change as { type?: unknown }).type}`)
    }

    for (const [sectionId, pendingPlacement] of pendingPlacementBySectionId) {
      const section = findSection(sectionId)
      const anchorSection = findSection(pendingPlacement.anchorSectionId)
      section.pendingPlacement = {
        mode: pendingPlacement.mode,
        anchorSectionTitle: anchorSection.title,
        ...(pendingPlacement.gap !== undefined ? { gap: pendingPlacement.gap } : {}),
      }
    }

    syncNodeSectionIds(nextMetadata, sections)
    nextMetadata.sections = sections

    await writeMetadataYaml(absoluteCanvasPath, nextMetadata)
    const metadataPath = path.join(absoluteCanvasPath, 'metadata.yaml')
    const syncResult = await this.handleFileChange('update', metadataPath)
    if (syncResult && syncResult.success === false) {
      throw new Error(syncResult.error)
    }

    return { paths: changedPaths }
  }

  constructor(options: SyncManagerOptions) {
    this.options = options
    this.log = options.logger.child({ component: 'SyncManager' })
  }

  /**
   * Initialize the sync manager:
   * - Connect to the Yjs server
   * - Hydrate filesystem
   * - Set up syncer for file changes
   */
  async initialize(): Promise<void> {
    const startTime = Date.now()
    this.log.info(
      {
        yjsServerHost: this.options.yjsServerHost,
        workspacePath: this.options.workspacePath,
        protocol: this.options.protocol ?? 'ws',
      },
      'Initializing sync manager'
    )

    // 1. Initialize API client for file operations
    this.log.debug('Initializing API client')
    initializeApiClient({
      backendUrl: this.options.backendUrl,
      authToken: this.options.authToken,
      logger: this.log,
    })

    // 2. Connect to the Yjs server (keep connection alive!)
    this.log.debug('Connecting to Yjs server')
    const host = this.options.yjsServerHost
    if (!host) {
      throw new Error('SyncManager requires yjsServerHost')
    }

    // Pre-fetch the first token so the initial connect uses a fresh token without waiting
    // on the `params` callback to fire synchronously from socket.io-client.
    await this.refreshSocketToken()

    this.connection = await connectToWorkspace({
      clientKind: 'execenv',
      host,
      workspaceId: this.options.workspaceId,
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
      protocol: this.options.protocol ?? 'ws',
      logger: this.log,
      socketToken: () => this.getFreshSocketToken(),
    })
    this.log.info('Connected to Yjs server')

    // 3. Convert workspace to filesystem tree (with binary file support)
    this.log.debug('Converting workspace to filesystem')
    const fileFetcher = (storagePath: string) => fetchFileBinary(storagePath)
    const resolveActorIdentityForHydration = async (actor: string): Promise<AuditIdentity | null> => {
      try {
        return await this.resolveActorIdentity(actor)
      } catch (error) {
        this.hydrationHadIdentityLookupFailure = true
        this.log.warn(
          { actor, error: error instanceof Error ? error.message : String(error) },
          'Actor identity lookup failed during hydration; writing null identity fields'
        )
        return null
      }
    }

    const fsTree = await workspaceToFilesystem(this.connection.proxy, this.connection.contentStore, {
      fileFetcher,
      logger: this.log,
      resolveActorIdentity: resolveActorIdentityForHydration,
    })

    // 4. Write to disk
    this.log.debug('Writing filesystem to disk')
    await clearDirectory(this.options.workspacePath)

    if (fsTree.children) {
      for (const child of fsTree.children) {
        await writeFSNode(child, this.options.workspacePath)
      }
    }
    this.log.debug({ fileCount: fsTree.children?.length ?? 0 }, 'Filesystem written')

    // 5. Build path mapper from workspace
    this.log.debug('Building path mapper')
    this.pathMapper = new PathMapper(this.log)
    this.pathMapper.buildFromWorkspace(this.connection.proxy)

    // 6. Create content converter and syncer with binary file support
    this.contentConverter = new ContentConverter(this.log)

    // Create file uploader that uses the backend API
    const fileUploader = async (buffer: Buffer, canvasId: string, filename: string, mimeType: string) => {
      return uploadFile(this.options.workspaceId, buffer, canvasId, filename, mimeType)
    }

    // Create file reader for binary files
    // FilesystemSyncer passes relative paths (e.g., 'random-data.csv')
    // readFileBinary expects absolute paths (e.g., '/workspace/random-data.csv')
    const fileReader = async (relativePath: string) => {
      const absolutePath = path.join(this.options.workspacePath, relativePath)
      return readFileBinary(absolutePath)
    }

    this.syncer = new FilesystemSyncer({
      proxy: this.connection.proxy,
      yDoc: this.connection.yDoc,
      contentStore: this.connection.contentStore,
      pathMapper: this.pathMapper,
      contentConverter: this.contentConverter,
      fileUploader,
      fileReader,
      logger: this.log,
      auditActor: `agent:${this.options.userId}`,
    })

    // 7. Create metadata manager
    this.metadataManager = new MetadataManager({
      logger: this.log,
      workspacePath: this.options.workspacePath,
      findCanvasById: (canvasId) => this.findCanvasById(this.connection?.proxy.root, canvasId),
      getCanvasPathById: (canvasId) => this.pathMapper?.getPathForCanvas(canvasId),
      listCanvasIds: () => this.listCanvasIds(),
      resolveActorIdentity: (actor) => this.resolveActorIdentity(actor),
    })

    if (this.hydrationHadIdentityLookupFailure) {
      this.log.warn('Scheduling metadata identity enrichment retry after hydration')
      this.enqueueMetadataRefreshAll('hydration_lookup_failure')
    }

    // 8. Seed markdown shadow state used for stale-write detection/merge.
    await this.seedMarkdownShadowState()

    // 9. Write ready marker
    await writeReadyMarker(this.options.workspacePath)

    const durationMs = Date.now() - startTime
    this.log.info({ durationMs }, 'Sync manager initialized and ready')
  }

  /**
   * Handle a file change from the watcher.
   *
   * Changes are serialized through a queue to prevent race conditions
   * on metadata.yaml when multiple events fire concurrently.
   *
   * @param type - Change type (create, update, delete)
   * @param absolutePath - Absolute path to the changed file/directory
   * @returns SyncResult indicating success/failure
   */
  handleFileChange(type: 'create' | 'update' | 'delete', absolutePath: string): Promise<SyncResult | undefined> {
    // Serialize through queue to prevent concurrent metadata.yaml access
    this.fileChangeQueue = this.fileChangeQueue
      .then(() => this.handleFileChangeInternal(type, absolutePath))
      .catch((err) => {
        this.log.error({ error: err, type, absolutePath }, 'Error in file change handler')
        return undefined
      })
    return this.fileChangeQueue
  }

  handleRename(
    oldAbsolutePath: string,
    newAbsolutePath: string,
    isDirectory: boolean
  ): Promise<SyncResult | undefined> {
    this.fileChangeQueue = this.fileChangeQueue
      .then(() => this.handleRenameInternal(oldAbsolutePath, newAbsolutePath, isDirectory))
      .catch((err) => {
        this.log.error({ error: err, oldAbsolutePath, newAbsolutePath, isDirectory }, 'Error in rename handler')
        return undefined
      })
    return this.fileChangeQueue
  }

  /**
   * Internal implementation of file change handling.
   * Called through the queue to ensure serialization.
   */
  private async handleFileChangeInternal(
    type: 'create' | 'update' | 'delete',
    absolutePath: string
  ): Promise<SyncResult | undefined> {
    if (!this.syncer || !this.metadataManager) {
      this.log.error('Not initialized')
      return undefined
    }

    const relativePath = path.relative(this.options.workspacePath, absolutePath)

    // Skip ignored files
    if (relativePath === '.ready' || relativePath.startsWith('.ready/')) {
      return undefined
    }

    // Create a correlation ID for this file change operation
    const changeLog = withCorrelationId(this.log)
    const startTime = Date.now()
    changeLog.debug({ type, relativePath }, 'Processing file change')

    // Protect canonical Kanwas file from deletion in sandbox.
    const blockedResult = await this.maybeBlockKanwasDelete(type, relativePath, absolutePath, changeLog)
    if (blockedResult) {
      return blockedResult
    }

    // Prepare content (undefined for dirs, null means skip)
    let content = await this.prepareContent(type, absolutePath, relativePath, changeLog)
    if (content === null) {
      return { success: true, action: 'no_op' }
    }

    const placementIntent =
      type === 'create' || type === 'update'
        ? await this.loadPlacementIntent(absolutePath, relativePath, changeLog)
        : null

    const markdownPreflight = await this.preflightMarkdownChange(
      type,
      relativePath,
      absolutePath,
      content,
      placementIntent !== null,
      changeLog
    )
    if (markdownPreflight?.shortCircuitResult) {
      return markdownPreflight.shortCircuitResult
    }
    if (markdownPreflight?.contentOverride !== undefined) {
      content = markdownPreflight.contentOverride
    }

    // SYNC FIRST (always)
    const result = await this.syncer.syncChange({
      type,
      path: relativePath,
      content,
      section: placementIntent?.section,
    })

    const durationMs = Date.now() - startTime
    if (!result.success) {
      changeLog.error({ type, relativePath, action: result.action, error: result.error, durationMs }, 'Sync failed')
      return result
    }

    if (placementIntent) {
      await this.deletePlacementIntent(absolutePath, changeLog)
    }

    changeLog.info(
      {
        type,
        relativePath,
        action: result.action,
        nodeId: result.nodeId,
        canvasId: result.canvasId,
        durationMs,
      },
      'Sync completed'
    )

    try {
      await this.updateMarkdownShadowFromSyncResult(type, relativePath, result)
    } catch (shadowError) {
      changeLog.warn(
        { error: shadowError, type, relativePath, action: result.action, nodeId: result.nodeId },
        'Failed to refresh markdown shadow state after sync'
      )
    }

    if (markdownPreflight?.writebackContentAfterSync !== undefined) {
      let writebackContent = markdownPreflight.writebackContentAfterSync
      if (result.nodeId) {
        const canonicalMarkdown = this.markdownShadowByNodeId.get(result.nodeId)
        if (canonicalMarkdown !== undefined) {
          writebackContent = canonicalMarkdown
        }
      }

      try {
        await this.writeMarkdownWithSuppression(relativePath, absolutePath, writebackContent, 'merge_writeback')
      } catch (writebackError) {
        changeLog.warn(
          { error: writebackError, type, relativePath, action: result.action, nodeId: result.nodeId },
          'Failed to write merged markdown back to filesystem'
        )
      }
    }

    // UPDATE METADATA AFTER (always)
    const metadataRetryCanvasIds = this.getMetadataRetryCanvasIds(result)
    try {
      await this.metadataManager.handleSyncResult(absolutePath, result)
      for (const canvasId of metadataRetryCanvasIds) {
        this.metadataRetryTasks.delete(canvasId)
      }
    } catch (metadataError) {
      const message = metadataError instanceof Error ? metadataError.message : String(metadataError)
      changeLog.error(
        {
          type,
          relativePath,
          action: result.action,
          canvasId: result.canvasId,
          parentCanvasId: result.parentCanvasId,
          error: message,
        },
        'Metadata step failed; scheduling retry'
      )

      for (const canvasId of metadataRetryCanvasIds) {
        this.enqueueMetadataRetry(canvasId, message)
      }
    }

    return result
  }

  private async handleRenameInternal(
    oldAbsolutePath: string,
    newAbsolutePath: string,
    isDirectory: boolean
  ): Promise<SyncResult | undefined> {
    if (!this.syncer || !this.metadataManager) {
      this.log.error('Not initialized')
      return undefined
    }

    const oldRelativePath = path.relative(this.options.workspacePath, oldAbsolutePath)
    const newRelativePath = path.relative(this.options.workspacePath, newAbsolutePath)

    if (
      oldRelativePath === '.ready' ||
      oldRelativePath.startsWith('.ready/') ||
      newRelativePath === '.ready' ||
      newRelativePath.startsWith('.ready/')
    ) {
      return undefined
    }

    const changeLog = withCorrelationId(this.log)
    const startTime = Date.now()
    changeLog.debug({ oldRelativePath, newRelativePath, isDirectory }, 'Processing file rename')

    const blockedResult = await this.maybeBlockKanwasDelete('delete', oldRelativePath, oldAbsolutePath, changeLog)
    if (blockedResult) {
      if (!blockedResult.success) {
        return blockedResult
      }

      if (!isDirectory) {
        await this.handleFileChangeInternal('create', newAbsolutePath)
      }
      return blockedResult
    }

    const result = await this.syncer.syncRename(oldRelativePath, newRelativePath, isDirectory)
    const durationMs = Date.now() - startTime

    if (!result.success) {
      changeLog.error(
        { oldRelativePath, newRelativePath, action: result.action, error: result.error, durationMs },
        'Rename sync failed'
      )
      return result
    }

    changeLog.info(
      {
        oldRelativePath,
        newRelativePath,
        isDirectory,
        action: result.action,
        nodeId: result.nodeId,
        canvasId: result.canvasId,
        parentCanvasId: result.parentCanvasId,
        durationMs,
      },
      'Rename sync completed'
    )

    await this.metadataManager.handleSyncResult(newAbsolutePath, result)
    return result
  }

  /**
   * Prepare content for sync operation.
   * @returns string content, undefined for directories, null to skip
   */
  private async prepareContent(
    type: 'create' | 'update' | 'delete',
    absolutePath: string,
    relativePath: string,
    log: Logger
  ): Promise<string | undefined | null> {
    const isKnownFileType =
      relativePath.endsWith('.md') || relativePath.endsWith('.yaml') || this.isBinaryFile(relativePath)

    if (type !== 'delete') {
      const isDir = await isDirectory(absolutePath)
      if (isDir) {
        return undefined // Directory - no content
      }
      if (!isKnownFileType) {
        return null // Unknown file type - skip
      }
      const content = await readFileContent(absolutePath)
      if (content === undefined) {
        log.error({ relativePath }, 'Error reading file')
        return null
      }
      return content
    } else {
      // For delete, skip unknown file types that aren't in PathMapper
      if (
        !isKnownFileType &&
        !this.pathMapper?.getMapping(relativePath) &&
        !this.pathMapper?.getCanvasMapping(relativePath)
      ) {
        return null
      }
      return undefined // Delete - no content needed
    }
  }

  private async loadPlacementIntent(
    absolutePath: string,
    relativePath: string,
    log: Logger
  ): Promise<PlacementIntentEnvelope | null> {
    const placementPath = this.getPlacementIntentPath(absolutePath)
    const raw = await readFileContent(placementPath)
    if (raw === undefined) {
      return null
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!this.isValidPlacementIntentEnvelope(parsed)) {
        log.warn({ relativePath, placementPath }, 'Skipping invalid placement intent file')
        return null
      }

      return parsed
    } catch (error) {
      log.warn({ relativePath, placementPath, error }, 'Failed to parse placement intent file')
      return null
    }
  }

  private async deletePlacementIntent(absolutePath: string, log: Logger): Promise<void> {
    const placementPath = this.getPlacementIntentPath(absolutePath)
    try {
      await fs.rm(placementPath, { force: true })
    } catch (error) {
      log.warn({ placementPath, error }, 'Failed to delete placement intent file')
    }
  }

  private getPlacementIntentPath(absolutePath: string): string {
    const relativePath = path.relative(this.options.workspacePath, absolutePath)
    return path.join(PLACEMENT_ROOT, `${relativePath}.json`)
  }

  private isValidPlacementIntentEnvelope(value: unknown): value is PlacementIntentEnvelope {
    if (!isObjectRecord(value)) {
      return false
    }

    const sectionValid = value.section === undefined || parseFileSection(value.section) !== null
    return value.section !== undefined && sectionValid
  }

  private async preflightMarkdownChange(
    type: 'create' | 'update' | 'delete',
    relativePath: string,
    absolutePath: string,
    content: string | undefined,
    hasPlacementIntent: boolean,
    log: Logger
  ): Promise<MarkdownPreflightResult | null> {
    if (type === 'delete') {
      return null
    }

    if (typeof content !== 'string' || !relativePath.endsWith('.md')) {
      return null
    }

    if (!this.connection || !this.pathMapper) {
      return null
    }

    const mapping = this.pathMapper.getMapping(relativePath)
    if (!mapping) {
      return null
    }

    if (this.consumeInternalWriteSuppression(relativePath, content)) {
      log.debug(
        {
          relativePath,
          nodeId: mapping.nodeId,
          decision: 'suppressed_internal_write',
          incomingHash: this.hashFingerprint(content),
        },
        'Skipped internally-generated markdown write'
      )
      return {
        shortCircuitResult: {
          success: true,
          action: 'no_op',
          nodeId: mapping.nodeId,
        },
      }
    }

    const nodeItem = this.findNodeById(this.connection.proxy.root, mapping.nodeId)
    if (!nodeItem) {
      return null
    }

    // Only editable markdown node types participate in merge preflight.
    if (nodeItem.xynode.type !== 'blockNote') {
      return null
    }

    const current = await this.getCanonicalMarkdownForNode(nodeItem)
    if (current === null) {
      return null
    }

    const shadowBase = this.markdownShadowByNodeId.get(mapping.nodeId)
    const base = shadowBase ?? current
    if (shadowBase === undefined) {
      this.markdownShadowByNodeId.set(mapping.nodeId, current)
    }

    const baseHash = this.hashFingerprint(base)
    const incomingHash = this.hashFingerprint(content)
    const currentHash = this.hashFingerprint(current)

    if (content === current && !hasPlacementIntent) {
      this.markdownShadowByNodeId.set(mapping.nodeId, current)

      log.debug(
        {
          relativePath,
          nodeId: mapping.nodeId,
          decision: 'canonical_noop',
          baseHash,
          incomingHash,
          currentHash,
        },
        'Skipped markdown update because filesystem already matches canonical yDoc content'
      )

      return {
        shortCircuitResult: {
          success: true,
          action: 'no_op',
          nodeId: mapping.nodeId,
        },
      }
    }

    if (base === current) {
      log.debug(
        {
          relativePath,
          nodeId: mapping.nodeId,
          decision: 'safe_apply',
          baseHash,
          incomingHash,
          currentHash,
        },
        'Markdown update has matching base snapshot'
      )
      return null
    }

    const mergeResult = mergeMarkdown3Way(base, content, current)

    if (mergeResult.status === 'merged') {
      const merged = mergeResult.content

      if (merged === current) {
        if (content !== current) {
          try {
            await this.writeMarkdownWithSuppression(relativePath, absolutePath, current, 'merge_noop_restore')
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              shortCircuitResult: {
                success: false,
                action: 'error',
                nodeId: mapping.nodeId,
                error: `Failed to restore markdown after merge no-op: ${message}`,
              },
            }
          }
        }

        this.markdownShadowByNodeId.set(mapping.nodeId, current)

        log.info(
          {
            relativePath,
            nodeId: mapping.nodeId,
            decision: 'merge_noop_preserved_ydoc',
            baseHash,
            incomingHash,
            currentHash,
            mergeStatus: 'merged',
          },
          'Merge produced canonical yDoc content; skipped stale apply'
        )

        return {
          shortCircuitResult: {
            success: true,
            action: 'no_op',
            nodeId: mapping.nodeId,
          },
        }
      }

      log.info(
        {
          relativePath,
          nodeId: mapping.nodeId,
          decision: 'merge_applied',
          baseHash,
          incomingHash,
          currentHash,
          mergedHash: this.hashFingerprint(merged),
          mergeStatus: 'merged',
        },
        'Applying merged markdown update'
      )

      return {
        contentOverride: merged,
        writebackContentAfterSync: merged === content ? undefined : merged,
      }
    }

    const mergeStatus = mergeResult.status
    const mergeError = mergeResult.status === 'error' ? mergeResult.error : undefined

    try {
      await this.writeMarkdownWithSuppression(relativePath, absolutePath, current, 'conflict_preserved_ydoc')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        shortCircuitResult: {
          success: false,
          action: 'error',
          nodeId: mapping.nodeId,
          error: `Failed to restore markdown after ${mergeStatus}: ${message}`,
        },
      }
    }

    this.markdownShadowByNodeId.set(mapping.nodeId, current)

    log.warn(
      {
        relativePath,
        nodeId: mapping.nodeId,
        decision: 'conflict_preserved_ydoc',
        baseHash,
        incomingHash,
        currentHash,
        mergeStatus,
        mergeError,
      },
      'Preserved yDoc markdown and restored file due to concurrent divergence'
    )

    return {
      shortCircuitResult: {
        success: true,
        action: 'no_op',
        nodeId: mapping.nodeId,
      },
    }
  }

  private async updateMarkdownShadowFromSyncResult(
    type: 'create' | 'update' | 'delete',
    relativePath: string,
    result: SyncResult
  ): Promise<void> {
    if (!relativePath.endsWith('.md')) {
      return
    }

    if (type === 'delete') {
      if (result.nodeId) {
        this.markdownShadowByNodeId.delete(result.nodeId)
      }
      return
    }

    const nodeId = result.nodeId ?? this.pathMapper?.getMapping(relativePath)?.nodeId
    if (!nodeId) {
      return
    }

    await this.refreshMarkdownShadowForNode(nodeId)
  }

  private async refreshMarkdownShadowForNode(nodeId: string): Promise<void> {
    const markdown = await this.getCanonicalMarkdownByNodeId(nodeId)
    if (markdown === null) {
      this.markdownShadowByNodeId.delete(nodeId)
      return
    }

    this.markdownShadowByNodeId.set(nodeId, markdown)
  }

  private async seedMarkdownShadowState(): Promise<void> {
    if (!this.connection || !this.pathMapper) {
      return
    }

    this.markdownShadowByNodeId.clear()

    const markdownMappings = this.pathMapper.getAllMappings().nodes.filter((mapping) => mapping.path.endsWith('.md'))

    let seeded = 0
    let skipped = 0

    for (const mapping of markdownMappings) {
      const markdown = await this.getCanonicalMarkdownByNodeId(mapping.nodeId)
      if (markdown === null) {
        skipped++
        continue
      }

      this.markdownShadowByNodeId.set(mapping.nodeId, markdown)
      seeded++
    }

    this.log.info(
      {
        markdownNodeMappings: markdownMappings.length,
        seededEntries: seeded,
        skippedEntries: skipped,
      },
      'Seeded markdown shadow state'
    )
  }

  private async getCanonicalMarkdownByNodeId(nodeId: string): Promise<string | null> {
    if (!this.connection) {
      return null
    }

    const node = this.findNodeById(this.connection.proxy.root, nodeId)
    if (!node) {
      return null
    }

    return await this.getCanonicalMarkdownForNode(node)
  }

  private async getCanonicalMarkdownForNode(node: NodeItem): Promise<string | null> {
    if (!this.connection) {
      return null
    }

    if (node.xynode.type !== 'blockNote') {
      return null
    }

    if (!this.contentConverter) {
      return null
    }

    const fragment = this.connection.contentStore.getBlockNoteFragment(node.id)
    if (!fragment) {
      return null
    }

    return await this.contentConverter.fragmentToMarkdown(fragment)
  }

  private findNodeById(canvas: CanvasItem | undefined, nodeId: string): NodeItem | null {
    if (!canvas) {
      return null
    }

    for (const item of canvas.items) {
      if (item.kind === 'node' && item.id === nodeId) {
        return item
      }

      if (item.kind === 'canvas') {
        const nestedNode = this.findNodeById(item, nodeId)
        if (nestedNode) {
          return nestedNode
        }
      }
    }

    return null
  }

  private hashText(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }

  private hashFingerprint(content: string): string {
    return this.hashText(content).slice(0, 12)
  }

  private registerInternalWriteSuppression(
    relativePath: string,
    content: string,
    reason: string
  ): InternalWriteSuppression {
    const existing = this.internalWriteSuppressionsByPath.get(relativePath) ?? []
    const now = Date.now()
    const active = existing.filter((suppression) => suppression.expiresAt > now)
    const suppression: InternalWriteSuppression = {
      hash: this.hashText(content),
      expiresAt: now + INTERNAL_WRITE_SUPPRESSION_TTL_MS,
      reason,
    }
    active.push(suppression)
    this.internalWriteSuppressionsByPath.set(relativePath, active)
    return suppression
  }

  private removeInternalWriteSuppression(relativePath: string, suppressionToRemove: InternalWriteSuppression): void {
    const suppressions = this.internalWriteSuppressionsByPath.get(relativePath)
    if (!suppressions) {
      return
    }

    const nextSuppressions = suppressions.filter((suppression) => suppression !== suppressionToRemove)
    if (nextSuppressions.length === 0) {
      this.internalWriteSuppressionsByPath.delete(relativePath)
      return
    }

    this.internalWriteSuppressionsByPath.set(relativePath, nextSuppressions)
  }

  private consumeInternalWriteSuppression(relativePath: string, content: string): boolean {
    const suppressions = this.internalWriteSuppressionsByPath.get(relativePath)
    if (!suppressions || suppressions.length === 0) {
      return false
    }

    const now = Date.now()
    const contentHash = this.hashText(content)
    const remainingSuppressions: InternalWriteSuppression[] = []
    let consumed = false

    for (const suppression of suppressions) {
      if (suppression.expiresAt <= now) {
        continue
      }

      if (!consumed && suppression.hash === contentHash) {
        consumed = true
        continue
      }

      remainingSuppressions.push(suppression)
    }

    if (remainingSuppressions.length === 0) {
      this.internalWriteSuppressionsByPath.delete(relativePath)
    } else {
      this.internalWriteSuppressionsByPath.set(relativePath, remainingSuppressions)
    }

    return consumed
  }

  private async writeMarkdownWithSuppression(
    relativePath: string,
    absolutePath: string,
    markdown: string,
    reason: string
  ): Promise<void> {
    const suppression = this.registerInternalWriteSuppression(relativePath, markdown, reason)

    try {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true })
      await fs.writeFile(absolutePath, markdown, 'utf-8')
    } catch (error) {
      this.removeInternalWriteSuppression(relativePath, suppression)
      throw error
    }
  }

  /**
   * Block deletion of canonical Kanwas.md while allowing edits and creates.
   */
  private async maybeBlockKanwasDelete(
    type: 'create' | 'update' | 'delete',
    relativePath: string,
    absolutePath: string,
    log: Logger
  ): Promise<SyncResult | null> {
    if (type !== 'delete') {
      return null
    }

    const canonicalKanwas = this.getCanonicalKanwasTarget()
    if (!canonicalKanwas || canonicalKanwas.relativePath !== relativePath) {
      return null
    }

    try {
      await this.restoreKanwasFile(canonicalKanwas.nodeId, absolutePath, relativePath)
      log.warn(
        { relativePath, nodeId: canonicalKanwas.nodeId },
        'Blocked delete attempt on protected Kanwas file and restored it from yDoc'
      )

      // Return no_op to avoid deleting canonical Kanwas node from yDoc.
      return {
        success: true,
        action: 'no_op',
        nodeId: canonicalKanwas.nodeId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      log.error(
        { error, relativePath, nodeId: canonicalKanwas.nodeId },
        'Blocked delete attempt on protected Kanwas file but restore failed'
      )

      return {
        success: false,
        action: 'error',
        nodeId: canonicalKanwas.nodeId,
        error: `Failed to restore protected Kanwas file: ${message}`,
      }
    }
  }

  /**
   * Restore Kanwas.md on disk from canonical yDoc content.
   */
  private async restoreKanwasFile(nodeId: string, absolutePath: string, relativePath: string): Promise<void> {
    if (!this.connection || !this.contentConverter) {
      throw new Error('Sync manager is not fully initialized')
    }

    const fragment = this.connection.contentStore.getBlockNoteFragment(nodeId)
    const markdown = fragment ? await this.contentConverter.fragmentToMarkdown(fragment) : ''

    await this.writeMarkdownWithSuppression(relativePath, absolutePath, markdown, 'kanwas_delete_restore')
  }

  /**
   * Locate canonical Kanwas node and its mapped filesystem path.
   */
  private getCanonicalKanwasTarget(): { nodeId: string; relativePath: string } | null {
    if (!this.connection || !this.pathMapper) {
      return null
    }

    const nodeId = this.findFirstKanwasNodeId(this.connection.proxy.root)
    if (!nodeId) {
      return null
    }

    const relativePath = this.pathMapper.getPathForNode(nodeId)
    if (!relativePath) {
      return null
    }

    return { nodeId, relativePath }
  }

  private findFirstKanwasNodeId(canvas: CanvasItem | undefined): string | null {
    if (!canvas) {
      return null
    }

    for (const item of canvas.items) {
      if (item.kind === 'node' && this.isKanwasSystemNode(item)) {
        return item.id
      }

      if (item.kind === 'canvas') {
        const nestedNodeId = this.findFirstKanwasNodeId(item)
        if (nestedNodeId) {
          return nestedNodeId
        }
      }
    }

    return null
  }

  private isKanwasSystemNode(node: NodeItem): boolean {
    if (node.xynode.type !== 'blockNote') {
      return false
    }

    if (!isObjectRecord(node.xynode.data)) {
      return false
    }

    return node.xynode.data.systemNodeKind === KANWAS_SYSTEM_NODE_KIND
  }

  /**
   * Check if a file path is a supported binary file (image, audio, document, etc.).
   */
  private isBinaryFile(relativePath: string): boolean {
    const ext = relativePath.split('.').pop()?.toLowerCase()
    if (!ext) return false
    return ext in BINARY_FILE_TYPES
  }

  private findCanvasById(canvas: CanvasItem | undefined, canvasId: string): CanvasItem | undefined {
    if (!canvas) {
      return undefined
    }

    if (canvas.id === canvasId) {
      return canvas
    }

    for (const item of canvas.items) {
      if (item.kind !== 'canvas') continue
      const nested = this.findCanvasById(item, canvasId)
      if (nested) return nested
    }

    return undefined
  }

  private listCanvasIds(): string[] {
    const root = this.connection?.proxy.root
    if (!root) return []

    const ids: string[] = []
    const visit = (canvas: CanvasItem): void => {
      ids.push(canvas.id)
      for (const item of canvas.items) {
        if (item.kind === 'canvas') {
          visit(item)
        }
      }
    }

    visit(root)
    return ids
  }

  private getMetadataRetryCanvasIds(result: SyncResult): string[] {
    const ids = new Set<string>()
    if (result.canvasId) {
      ids.add(result.canvasId)
    }
    if (result.parentCanvasId) {
      ids.add(result.parentCanvasId)
    }
    return Array.from(ids)
  }

  private async resolveActorIdentity(actor: string): Promise<AuditIdentity | null> {
    const parsed = parseAuditActor(actor)
    if (!parsed) {
      return null
    }

    const cached = this.actorIdentityCache.get(parsed.actor)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.value
    }

    const members = await this.getWorkspaceMembers()
    const member = members.find((entry) => entry.id === parsed.id)

    let identity: AuditIdentity | null = null
    if (member) {
      identity = {
        id: member.id,
        name: member.name,
        email: member.email,
      }
    } else {
      const me = await this.getCurrentUser()
      if (me.id === parsed.id) {
        identity = {
          id: me.id,
          name: me.name,
          email: me.email,
        }
      }
    }

    this.actorIdentityCache.set(parsed.actor, {
      value: identity,
      expiresAt: now + ACTOR_IDENTITY_CACHE_TTL_MS,
    })

    return identity
  }

  private async getWorkspaceMembers(): Promise<Array<{ id: string; name: string | null; email: string | null }>> {
    const now = Date.now()
    if (this.workspaceMembersCache && this.workspaceMembersCache.expiresAt > now) {
      return this.workspaceMembersCache.members
    }

    const members = await fetchWorkspaceMembers(this.options.workspaceId)
    const normalized = members.map((member) => ({
      id: member.userId,
      name: member.name ?? null,
      email: member.email ?? null,
    }))

    this.workspaceMembersCache = {
      members: normalized,
      expiresAt: now + ACTOR_IDENTITY_CACHE_TTL_MS,
    }

    return normalized
  }

  private async getCurrentUser(): Promise<{ id: string; name: string; email: string }> {
    const now = Date.now()
    if (this.currentUserCache && this.currentUserCache.expiresAt > now) {
      return this.currentUserCache.value
    }

    const user = await fetchCurrentUser()
    this.currentUserCache = {
      value: user,
      expiresAt: now + ACTOR_IDENTITY_CACHE_TTL_MS,
    }

    return user
  }

  private enqueueMetadataRefreshAll(reason: string): void {
    for (const canvasId of this.listCanvasIds()) {
      this.enqueueMetadataRetry(canvasId, reason)
    }
  }

  private enqueueMetadataRetry(canvasId: string, error: string): void {
    const existing = this.metadataRetryTasks.get(canvasId)
    if (existing) {
      return
    }

    const task: MetadataRetryTask = {
      canvasId,
      attempts: 0,
      nextRunAt: Date.now() + METADATA_RETRY_BASE_DELAY_MS,
      lastError: error,
    }

    this.metadataRetryTasks.set(canvasId, task)
    this.scheduleMetadataRetryWorker()
  }

  private scheduleMetadataRetryWorker(): void {
    if (this.metadataRetryTimer) {
      clearTimeout(this.metadataRetryTimer)
      this.metadataRetryTimer = null
    }

    if (this.metadataRetryTasks.size === 0) {
      return
    }

    let nextRunAt = Number.POSITIVE_INFINITY
    for (const task of this.metadataRetryTasks.values()) {
      if (task.nextRunAt < nextRunAt) {
        nextRunAt = task.nextRunAt
      }
    }

    const delayMs = Math.max(0, nextRunAt - Date.now())
    this.metadataRetryTimer = setTimeout(() => {
      void this.runMetadataRetryWorker()
    }, delayMs)
  }

  private async runMetadataRetryWorker(): Promise<void> {
    if (this.metadataRetryWorkerRunning) {
      return
    }
    this.metadataRetryWorkerRunning = true

    try {
      if (!this.metadataManager) {
        return
      }

      const now = Date.now()
      const dueTasks = Array.from(this.metadataRetryTasks.values())
        .filter((task) => task.nextRunAt <= now)
        .sort((a, b) => a.nextRunAt - b.nextRunAt)

      for (const task of dueTasks) {
        try {
          await this.metadataManager.refreshCanvasMetadata(task.canvasId)
          this.metadataRetryTasks.delete(task.canvasId)
          this.log.info({ canvasId: task.canvasId, attempts: task.attempts + 1 }, 'Metadata retry succeeded')
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const nextAttempts = task.attempts + 1

          if (nextAttempts >= METADATA_RETRY_MAX_ATTEMPTS) {
            this.metadataRetryTasks.delete(task.canvasId)
            this.log.error(
              { canvasId: task.canvasId, attempts: nextAttempts, error: message, initialError: task.lastError },
              'Metadata retry exhausted'
            )
            continue
          }

          task.attempts = nextAttempts
          task.lastError = message
          task.nextRunAt = Date.now() + this.getMetadataRetryDelayMs(nextAttempts)
          this.metadataRetryTasks.set(task.canvasId, task)

          this.log.warn(
            {
              canvasId: task.canvasId,
              attempts: nextAttempts,
              nextDelayMs: this.getMetadataRetryDelayMs(nextAttempts),
              error: message,
            },
            'Metadata retry failed; rescheduled'
          )
        }
      }
    } finally {
      this.metadataRetryWorkerRunning = false
      this.scheduleMetadataRetryWorker()
    }
  }

  private getMetadataRetryDelayMs(attempt: number): number {
    return Math.min(METADATA_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), METADATA_RETRY_MAX_DELAY_MS)
  }

  private async refreshSocketToken(): Promise<string> {
    const response = await fetchYjsSocketToken(this.options.workspaceId)
    const expiresAtMs = Date.parse(response.expiresAt)
    this.cachedSocketToken = {
      token: response.token,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 3600_000,
    }
    return response.token
  }

  private getFreshSocketToken(): string | undefined {
    const cached = this.cachedSocketToken
    if (!cached) {
      // First call races with initialize(); return undefined and let the async refresh in
      // initialize() populate the cache. Subsequent reconnects will find a cached token.
      void this.refreshSocketToken().catch((error) => {
        this.log.warn({ err: error }, 'Background Yjs socket token refresh failed')
      })
      return undefined
    }

    const msUntilExpiry = cached.expiresAtMs - Date.now()
    if (msUntilExpiry < 60_000) {
      // Kick off a refresh; reconnect will pick up the new token on the next attempt.
      void this.refreshSocketToken().catch((error) => {
        this.log.warn({ err: error }, 'Yjs socket token refresh failed')
      })
    }

    return cached.token
  }

  /**
   * Shutdown the sync manager and clean up resources.
   */
  shutdown(): void {
    this.log.info('Shutting down')
    if (this.metadataRetryTimer) {
      clearTimeout(this.metadataRetryTimer)
      this.metadataRetryTimer = null
    }
    if (this.connection) {
      this.connection.disconnect()
      this.log.debug('Disconnected from Yjs server')
    }
    this.connection = null
    this.pathMapper = null
    this.syncer = null
    this.contentConverter = null
    this.metadataManager = null
    this.markdownShadowByNodeId.clear()
    this.internalWriteSuppressionsByPath.clear()
    this.actorIdentityCache.clear()
    this.workspaceMembersCache = null
    this.currentUserCache = null
    this.metadataRetryTasks.clear()
    this.log.info('Shutdown complete')
  }

  /**
   * Check if the sync manager is initialized.
   */
  get isInitialized(): boolean {
    return this.connection !== null && this.syncer !== null
  }

  private normalizeCanvasPath(canvasPath: string): string {
    const normalized = canvasPath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\/+/, '')
      .replace(/\/+$/, '')
    if (!normalized || normalized.includes('\0') || normalized.split('/').some((segment) => segment === '..')) {
      throw new Error('canvasPath must be a workspace-relative canvas directory.')
    }

    return normalized
  }

  private resolveCanvasDirectory(normalizedCanvasPath: string): string {
    const workspaceRoot = path.resolve(this.options.workspacePath)
    const absoluteCanvasPath = path.resolve(workspaceRoot, normalizedCanvasPath)
    if (absoluteCanvasPath === workspaceRoot || !absoluteCanvasPath.startsWith(`${workspaceRoot}${path.sep}`)) {
      throw new Error('canvasPath must be a workspace-relative canvas directory.')
    }

    return absoluteCanvasPath
  }

  private hasSectionInCanvas(relativePath: string, title: string): boolean {
    const normalizedTitle = title.trim()
    if (!normalizedTitle || !this.connection?.proxy.root || !this.pathMapper) {
      return false
    }

    const resolution = this.pathMapper.resolveNewFile(relativePath)
    if (!resolution) {
      return false
    }

    const canvas = this.findCanvasById(this.connection.proxy.root, resolution.canvasId)
    if (!canvas) {
      return false
    }

    return (canvas.sections ?? []).some((section) => section.title === normalizedTitle)
  }

  private resolveFileAnchorPlacementSnapshot(input: {
    targetRelativePath: string
    anchorFilePath: string
    fallbackSectionTitle: string
  }): FileAnchorPlacementResolution {
    const unresolved: FileAnchorPlacementResolution = {
      exists: false,
      destinationSectionTitle: null,
      createsSectionTitle: null,
    }

    if (!this.connection?.proxy.root || !this.pathMapper) {
      return unresolved
    }

    const normalizedTargetPath = input.targetRelativePath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\/+/, '')
    const normalizedAnchorPath = input.anchorFilePath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\/+/, '')
    const fallbackSectionTitle = input.fallbackSectionTitle.trim()

    if (!normalizedTargetPath || !normalizedAnchorPath || !fallbackSectionTitle) {
      return unresolved
    }

    if (normalizedTargetPath === normalizedAnchorPath) {
      return unresolved
    }

    const targetResolution = this.pathMapper.resolveNewFile(normalizedTargetPath)
    const anchorMapping = this.pathMapper.getMapping(normalizedAnchorPath)
    if (!targetResolution || !anchorMapping || anchorMapping.canvasId !== targetResolution.canvasId) {
      return unresolved
    }

    const canvas = this.findCanvasById(this.connection.proxy.root, targetResolution.canvasId)
    if (!canvas) {
      return unresolved
    }

    const anchorNode = canvas.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.id === anchorMapping.nodeId
    )
    if (!anchorNode) {
      return unresolved
    }

    const anchorSection = (canvas.sections ?? []).find((section) => section.memberIds.includes(anchorNode.id))
    if (anchorSection) {
      return {
        exists: true,
        destinationSectionTitle: anchorSection.title,
        createsSectionTitle: null,
      }
    }

    if ((canvas.sections ?? []).some((section) => section.title === fallbackSectionTitle)) {
      return {
        exists: true,
        destinationSectionTitle: null,
        createsSectionTitle: null,
        code: 'section_title_conflict',
        error: `Section already exists for unsectioned anchor file: ${fallbackSectionTitle}`,
      }
    }

    return {
      exists: true,
      destinationSectionTitle: fallbackSectionTitle,
      createsSectionTitle: fallbackSectionTitle,
    }
  }
}
