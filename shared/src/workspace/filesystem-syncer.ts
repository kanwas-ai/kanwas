import * as Y from 'yjs'
import * as yaml from 'yaml'
import { createHash } from 'crypto'
import type {
  WorkspaceDocument,
  CanvasItem,
  NodeItem,
  BlockNoteNode,
  CanvasMetadata,
  FileSection,
  ImageNodeData,
  FileNodeData,
  AudioNodeData,
  LinkNodeData,
  SectionDef,
  TextNodeData,
  StickyNoteNodeData,
  PendingCanvasPlacement,
} from '../types.js'
import { PathMapper, type PathMapping } from './path-mapper.js'
import {
  calculateImageDisplaySize,
  calculateItemPosition,
  sanitizeFilename,
  CANVAS_NODE_LAYOUT,
  IMAGE_NODE_LAYOUT,
} from '../constants.js'
import { getImageDimensionsFromBuffer } from '../image-utils.js'
import { ContentConverter } from './content-converter.js'
import { BINARY_FILE_TYPES, type BinaryFileExtension, isBinaryNodeType } from './binary-types.js'
import { type Logger, noopLogger } from '../logging/types.js'
import { createWorkspaceContentStore, type WorkspaceContentStore } from './workspace-content-store.js'
import {
  mergeAuditFields,
  stampCreateAuditOnCanvas,
  stampCreateAuditOnNode,
  touchAuditIfCanvasUpdated,
  touchAuditIfNodeUpdated,
} from './audit.js'
import { sanitizeCanvasMetadata } from './metadata-sanitizer.js'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface FileChange {
  type: 'create' | 'update' | 'delete'
  path: string
  content?: string
  section?: FileSection
  /** Binary content for binary files (images, PDFs, etc.) */
  binaryContent?: Buffer
}

type FileAnchoredCreateSection = {
  mode: 'create'
  title: string
  layout: SectionDef['layout']
  placement: { mode: 'with_file'; anchorFilePath: string }
  columns?: number
}

/**
 * Result of uploading a file to storage
 */
export interface FileUploadResult {
  storagePath: string
  mimeType: string
  size: number
}

/**
 * Generic file uploader - works for images, PDFs, any binary file
 */
export type FileUploader = (
  fileBuffer: Buffer,
  canvasId: string,
  filename: string,
  mimeType: string
) => Promise<FileUploadResult>

/**
 * Generic file reader - reads binary from filesystem
 */
export type FileReader = (absolutePath: string) => Promise<Buffer>

interface SyncResultBase {
  nodeId?: string
  canvasId?: string
  /** Parent canvas affected by structural canvas operations */
  parentCanvasId?: string
  /** Additional canvases whose metadata should be refreshed */
  affectedCanvasIds?: string[]
}

export interface CreatedNodeSyncResult extends SyncResultBase {
  success: true
  action: 'created_node'
  nodeId: string
  canvasId: string
  /** Full node item for created_node actions */
  node: NodeItem
}

export interface UpdatedContentSyncResult extends SyncResultBase {
  success: true
  action: 'updated_content'
  nodeId: string
  canvasId: string
}

export interface UpdatedBinaryContentSyncResult extends SyncResultBase {
  success: true
  action: 'updated_binary_content'
  nodeId: string
  canvasId: string
  node: NodeItem
}

export interface DeletedNodeSyncResult extends SyncResultBase {
  success: true
  action: 'deleted_node'
  nodeId: string
  canvasId: string
}

export interface UpdatedMetadataSyncResult extends SyncResultBase {
  success: true
  action: 'updated_metadata'
  canvasId: string
  changedNodeIds: string[]
  canvasChanged: boolean
}

export interface CreatedCanvasSyncResult extends SyncResultBase {
  success: true
  action: 'created_canvas'
  canvasId: string
  parentCanvasId: string
  /** Full canvas item for created_canvas actions */
  canvas: CanvasItem
}

export interface DeletedCanvasSyncResult extends SyncResultBase {
  success: true
  action: 'deleted_canvas'
  canvasId: string
  parentCanvasId: string
}

export interface RenamedNodeSyncResult extends SyncResultBase {
  success: true
  action: 'renamed_node'
  nodeId: string
  canvasId: string
}

export interface RenamedCanvasSyncResult extends SyncResultBase {
  success: true
  action: 'renamed_canvas'
  canvasId: string
  parentCanvasId: string
}

export interface NoOpSyncResult extends SyncResultBase {
  success: true
  action: 'no_op'
}

export interface ErrorSyncResult extends SyncResultBase {
  success: false
  action: 'error'
  error: string
}

export type SyncResult =
  | CreatedNodeSyncResult
  | UpdatedContentSyncResult
  | UpdatedBinaryContentSyncResult
  | DeletedNodeSyncResult
  | UpdatedMetadataSyncResult
  | CreatedCanvasSyncResult
  | DeletedCanvasSyncResult
  | RenamedNodeSyncResult
  | RenamedCanvasSyncResult
  | NoOpSyncResult
  | ErrorSyncResult

export type SyncAction = SyncResult['action']

interface MetadataApplyResult {
  canvasChanged: boolean
  changedNodeIds: Set<string>
}

// ============================================================================
// NO-OP FILE HANDLERS
// ============================================================================

/**
 * Creates a no-op FileUploader that throws an error.
 * Use when binary file operations are not expected.
 */
export function createNoOpFileUploader(): FileUploader {
  return async () => {
    throw new Error('FileUploader not configured for this test - binary file upload was attempted unexpectedly')
  }
}

/**
 * Creates a no-op FileReader that throws an error.
 * Use when binary file operations are not expected.
 */
export function createNoOpFileReader(): FileReader {
  return async () => {
    throw new Error('FileReader not configured for this test - binary file read was attempted unexpectedly')
  }
}

// ============================================================================
// FILESYSTEM SYNCER OPTIONS
// ============================================================================

export interface FilesystemSyncerOptions {
  proxy: WorkspaceDocument
  yDoc: Y.Doc
  contentStore?: WorkspaceContentStore
  pathMapper: PathMapper
  contentConverter: ContentConverter
  fileUploader: FileUploader
  fileReader: FileReader
  logger?: Logger
  auditActor?: string
  now?: () => string
  /** Auto-create missing parent canvases for new files (off by default) */
  autoCreateCanvases?: boolean
}

// ============================================================================
// FILESYSTEM SYNCER
// ============================================================================

/**
 * FilesystemSyncer applies filesystem changes to the Yjs workspace document.
 *
 * It uses the valtio-y proxy for structural changes (adding/removing nodes)
 * and a workspace content store for note content changes.
 */
export class FilesystemSyncer {
  private proxy: WorkspaceDocument
  private contentStore: WorkspaceContentStore
  private pathMapper: PathMapper
  private contentConverter: ContentConverter
  private fileUploader: FileUploader
  private fileReader: FileReader
  private log: Logger
  private auditActor?: string
  private readonly now: () => string
  private autoCreateCanvases: boolean

  constructor(options: FilesystemSyncerOptions) {
    this.proxy = options.proxy
    this.contentStore = options.contentStore ?? createWorkspaceContentStore(options.yDoc)
    this.pathMapper = options.pathMapper
    this.contentConverter = options.contentConverter
    this.fileUploader = options.fileUploader
    this.fileReader = options.fileReader
    this.log = options.logger?.child({ component: 'FilesystemSyncer' }) ?? noopLogger
    this.auditActor = options.auditActor
    this.now = options.now ?? (() => new Date().toISOString())
    this.autoCreateCanvases = options.autoCreateCanvases ?? false
  }

  /**
   * Main entry point - sync a filesystem change to the workspace
   */
  async syncChange(change: FileChange): Promise<SyncResult> {
    const startTime = Date.now()
    this.log.debug({ path: change.path, changeType: change.type }, 'Processing file change')

    try {
      let result: SyncResult

      // Determine what type of change this is based on path
      if (change.path.endsWith('metadata.yaml')) {
        result = await this.syncMetadata(change)
      } else if (change.path.endsWith('.sticky.yaml')) {
        result = await this.syncStickyNoteFile(change)
      } else if (change.path.endsWith('.text.yaml')) {
        result = await this.syncTextFile(change)
      } else if (change.path.endsWith('.url.yaml')) {
        // Check for .url.yaml files BEFORE .md check (compound extension)
        result = await this.syncUrlFile(change)
      } else if (change.path.endsWith('.md')) {
        result = await this.syncMarkdownFile(change)
      } else {
        // Check if it's a binary file (image, PDF, etc.)
        const binaryFileInfo = this.getBinaryFileInfo(change.path)
        if (binaryFileInfo) {
          result = await this.syncBinaryFile(change, binaryFileInfo)
        } else if (this.pathMapper.isCanvasPath(change.path)) {
          // Check if it's a directory operation (all directories are canvases now)
          result = await this.syncCanvas(change)
        } else {
          // Other files are ignored
          result = { success: true, action: 'no_op' }
        }
      }

      const durationMs = Date.now() - startTime
      if (result.action !== 'no_op') {
        this.log.info(
          {
            path: change.path,
            changeType: change.type,
            action: result.action,
            nodeId: result.nodeId,
            canvasId: result.canvasId,
            success: result.success,
            durationMs,
          },
          `Sync completed: ${result.action}`
        )
      } else {
        this.log.debug({ path: change.path, durationMs }, 'Sync skipped (no_op)')
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.error({ path: change.path, changeType: change.type, error: message }, 'Sync failed with error')
      return { success: false, action: 'error', error: message }
    }
  }

  async syncRename(oldPath: string, newPath: string, isDirectory: boolean): Promise<SyncResult> {
    const startTime = Date.now()
    this.log.debug({ oldPath, newPath, isDirectory }, 'Processing file rename')

    try {
      const result = isDirectory
        ? await this.renameCanvas(oldPath, newPath)
        : await this.renameNodeFile(oldPath, newPath)

      const durationMs = Date.now() - startTime
      if (result.action !== 'no_op') {
        this.log.info(
          {
            oldPath,
            newPath,
            isDirectory,
            action: result.action,
            nodeId: result.nodeId,
            canvasId: result.canvasId,
            parentCanvasId: result.parentCanvasId,
            success: result.success,
            durationMs,
          },
          `Rename sync completed: ${result.action}`
        )
      } else {
        this.log.debug({ oldPath, newPath, durationMs }, 'Rename sync skipped (no_op)')
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.error({ oldPath, newPath, isDirectory, error: message }, 'Rename sync failed with error')
      return { success: false, action: 'error', error: message }
    }
  }

  /**
   * Returns file type info if path is a supported binary file, null otherwise
   */
  private getBinaryFileInfo(path: string): { nodeType: string; mimeType: string } | null {
    const ext = path.split('.').pop()?.toLowerCase()
    if (!ext) return null
    return BINARY_FILE_TYPES[ext as BinaryFileExtension] ?? null
  }

  private getNodeSectionId(nodeItem: NodeItem): string | undefined {
    const sectionId = (nodeItem.xynode.data as { sectionId?: unknown } | undefined)?.sectionId
    return typeof sectionId === 'string' && sectionId.length > 0 ? sectionId : undefined
  }

  private setNodeSectionId(nodeItem: NodeItem, sectionId: string | undefined): void {
    const data = nodeItem.xynode.data as Record<string, unknown>
    if (sectionId) {
      data.sectionId = sectionId
      return
    }

    delete data.sectionId
  }

  private setPendingCanvasPlacement(nodeItem: NodeItem, reason: PendingCanvasPlacement['reason']): void {
    const data = nodeItem.xynode.data as Record<string, unknown>
    data.pendingCanvasPlacement = { source: 'filesystem', reason } satisfies PendingCanvasPlacement
  }

  private markCreatedNodeForFrontendPlacement(change: FileChange, nodeItem: NodeItem): void {
    if (change.section) {
      return
    }

    this.setPendingCanvasPlacement(nodeItem, 'created')
  }

  private removeNodeFromGroups(canvas: CanvasItem, nodeId: string): void {
    if (!canvas.groups) {
      return
    }

    for (const group of canvas.groups) {
      group.memberIds = (group.memberIds ?? []).filter((memberId) => memberId !== nodeId)
    }

    canvas.groups = canvas.groups.filter((group) => (group.memberIds ?? []).length > 0)
  }

  private removeNodeFromSections(canvas: CanvasItem, nodeId: string): void {
    if (!canvas.sections || canvas.sections.length === 0) {
      return
    }

    for (const section of canvas.sections) {
      section.memberIds = section.memberIds.filter((memberId) => memberId !== nodeId)
    }

    canvas.sections = canvas.sections.filter((section) => section.memberIds.length > 0)
  }

  private findSectionByTitle(canvas: CanvasItem, title: string): SectionDef | undefined {
    return (canvas.sections ?? []).find((section) => section.title === title)
  }

  private findSectionContainingNode(canvas: CanvasItem, nodeId: string): SectionDef | undefined {
    return (canvas.sections ?? []).find((section) => section.memberIds.includes(nodeId))
  }

  private isFileAnchoredCreateSection(section: FileSection): section is FileAnchoredCreateSection {
    return section.mode === 'create' && 'placement' in section && section.placement.mode === 'with_file'
  }

  private ensureSectionForFileAnchor(
    change: FileChange,
    canvas: CanvasItem,
    section: FileAnchoredCreateSection
  ): SectionDef {
    const anchorPath = section.placement.anchorFilePath
    if (anchorPath === change.path) {
      throw new Error(`Anchor file cannot be the target file: ${anchorPath}`)
    }

    const anchorMapping = this.pathMapper.getMapping(anchorPath)
    if (!anchorMapping) {
      throw new Error(`Anchor file not found: ${anchorPath}`)
    }

    if (anchorMapping.canvasId !== canvas.id) {
      throw new Error(`Anchor file must be in the same canvas: ${anchorPath}`)
    }

    const anchorItem = canvas.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.id === anchorMapping.nodeId
    )
    if (!anchorItem) {
      throw new Error(`Anchor node not found: ${anchorPath}`)
    }

    const anchorSection = this.findSectionContainingNode(canvas, anchorItem.id)
    if (anchorSection) {
      return anchorSection
    }

    const existing = this.findSectionByTitle(canvas, section.title)
    if (existing) {
      throw new Error(`Section already exists for unsectioned anchor file: ${section.title}`)
    }

    const nextSection: SectionDef = {
      id: crypto.randomUUID(),
      title: section.title,
      layout: section.layout,
      position: { ...anchorItem.xynode.position },
      memberIds: [anchorItem.id],
      ...(section.layout === 'grid' && section.columns !== undefined ? { columns: section.columns } : {}),
    }

    canvas.sections = [...(canvas.sections ?? []), nextSection]
    this.setNodeSectionId(anchorItem, nextSection.id)
    this.touchNodeAndCanvas(anchorItem, canvas)

    return nextSection
  }

  private ensureSectionForChange(canvas: CanvasItem, section: FileSection): SectionDef {
    const existing = this.findSectionByTitle(canvas, section.title)

    if (section.mode === 'join') {
      if (!existing) {
        throw new Error(`Section not found: ${section.title}`)
      }
      return existing
    }

    let position: SectionDef['position']
    let pendingPlacement: SectionDef['pendingPlacement'] | undefined

    if ('placement' in section) {
      if (section.placement.mode === 'with_file') {
        throw new Error(`File anchor placement requires a target file context: ${section.placement.anchorFilePath}`)
      }

      const anchor = this.findSectionByTitle(canvas, section.placement.anchorSectionTitle)
      if (!anchor) {
        throw new Error(`Anchor section not found: ${section.placement.anchorSectionTitle}`)
      }

      position = { x: 0, y: 0 }
      pendingPlacement = section.placement
    } else {
      position = { x: section.x, y: section.y }
    }

    if (existing) {
      return existing
    }

    const nextSection: SectionDef = {
      id: crypto.randomUUID(),
      title: section.title,
      layout: section.layout,
      position,
      memberIds: [],
      ...(section.layout === 'grid' && section.columns !== undefined ? { columns: section.columns } : {}),
      ...(pendingPlacement ? { pendingPlacement } : {}),
    }

    canvas.sections = [...(canvas.sections ?? []), nextSection]
    return nextSection
  }

  private applySectionToNode(change: FileChange, canvas: CanvasItem, nodeItem: NodeItem): void {
    if (!change.section) {
      return
    }

    const nextSection = this.isFileAnchoredCreateSection(change.section)
      ? this.ensureSectionForFileAnchor(change, canvas, change.section)
      : this.ensureSectionForChange(canvas, change.section)
    const previousSectionId = this.getNodeSectionId(nodeItem)
    if (previousSectionId && previousSectionId !== nextSection.id) {
      this.removeNodeFromSections(canvas, nodeItem.id)
    }

    if (!nextSection.memberIds.includes(nodeItem.id)) {
      nextSection.memberIds = [...nextSection.memberIds, nodeItem.id]
    }

    this.setNodeSectionId(nodeItem, nextSection.id)
  }

  // ============================================================================
  // MARKDOWN FILE SYNC
  // ============================================================================

  private async syncMarkdownFile(change: FileChange): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(change.path)

    switch (change.type) {
      case 'create':
        if (mapping) {
          // File recreated for existing node - treat as update
          return await this.updateNodeContent(mapping, change)
        }
        // New file - create new node
        return await this.createNode(change)

      case 'update':
        if (!mapping) {
          // Unknown file updated - might be a new file we haven't mapped yet
          // Try to create it as a new node
          return await this.createNode(change)
        }
        return await this.updateNodeContent(mapping, change)

      case 'delete':
        if (!mapping) {
          return { success: true, action: 'no_op' }
        }
        return await this.deleteNode(mapping)
    }
  }

  private async createNode(change: FileChange): Promise<SyncResult> {
    let parentInfo = this.pathMapper.resolveNewFile(change.path)
    if (!parentInfo && this.autoCreateCanvases) {
      const result = await this.ensureParentCanvas(change.path)
      if (!result.success) return result
      parentInfo = this.pathMapper.resolveNewFile(change.path)
    }
    if (!parentInfo) {
      return {
        success: false,
        action: 'error',
        error: 'Cannot determine parent canvas for new file',
      }
    }

    // Find the parent canvas
    const canvas = this.findCanvasById(parentInfo.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${parentInfo.canvasId}`,
      }
    }

    // Generate new node ID
    const nodeId = crypto.randomUUID()

    // Create BlockNote content in the configured content store
    const content = change.content || ''
    this.contentStore.createNoteDoc(nodeId, 'blockNote')
    const fragment = this.contentStore.getBlockNoteFragment(nodeId)
    if (!fragment) {
      throw new Error(`Failed to create BlockNote content for node ${nodeId}`)
    }
    try {
      await this.contentConverter.updateFragmentFromMarkdown(fragment, content, {
        nodeId,
        source: 'FilesystemSyncer.createNode',
      })
    } catch (error) {
      this.contentStore.deleteNoteDoc(nodeId)
      throw error
    }

    // Create the NodeItem
    const xynode: BlockNoteNode = {
      id: nodeId,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    }

    // Strip .md extension from node name and enforce lower-kebab-case
    const nodeName = sanitizeFilename(parentInfo.nodeName.replace(/\.md$/, ''))

    const nodeItem: NodeItem = {
      kind: 'node',
      id: nodeId,
      name: nodeName,
      xynode,
    }

    this.applySectionToNode(change, canvas, nodeItem)
    this.markCreatedNodeForFrontendPlacement(change, nodeItem)

    this.stampCreateAuditNode(nodeItem)
    this.touchCanvas(canvas)

    // Add to canvas items (valtio-y handles Yjs sync)
    canvas.items.push(nodeItem)

    // Update path mapper
    this.pathMapper.addMapping({
      path: change.path,
      nodeId,
      canvasId: parentInfo.canvasId,
      originalName: nodeName,
      type: 'node',
    })

    return { success: true, action: 'created_node', nodeId, canvasId: parentInfo.canvasId, node: nodeItem }
  }

  private async updateNodeContent(mapping: PathMapping, change: FileChange): Promise<SyncResult> {
    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${mapping.canvasId}`,
      }
    }

    const nodeItem = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === mapping.nodeId)
    if (!nodeItem) {
      return {
        success: false,
        action: 'error',
        error: `Node not found: ${mapping.nodeId}`,
      }
    }

    if (nodeItem.xynode.type !== 'blockNote') {
      this.log.warn(
        { nodeId: mapping.nodeId, nodeType: nodeItem.xynode.type, path: mapping.path },
        'Ignoring markdown update for non-editable node type'
      )
      return { success: true, action: 'no_op', nodeId: mapping.nodeId }
    }

    const fragment = this.contentStore.getBlockNoteFragment(mapping.nodeId)
    if (!fragment) {
      this.log.error(
        { nodeId: mapping.nodeId, path: mapping.path },
        'Cannot update markdown node: missing BlockNote content'
      )
      throw new Error(`Cannot update markdown node ${mapping.nodeId}: missing BlockNote content`)
    }

    // Update content by mutating the existing fragment instance.
    await this.contentConverter.updateFragmentFromMarkdown(fragment, change.content || '', {
      nodeId: mapping.nodeId,
      source: 'FilesystemSyncer.updateNodeContent',
    })

    this.applySectionToNode(change, canvas, nodeItem)

    this.touchNodeAndCanvas(nodeItem, canvas)
    return { success: true, action: 'updated_content', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  // ============================================================================
  // URL FILE SYNC (.url.yaml)
  // ============================================================================

  private async syncUrlFile(change: FileChange): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(change.path)

    switch (change.type) {
      case 'create':
        if (mapping) {
          // File recreated for existing node - treat as update
          return await this.updateLinkNode(mapping, change)
        }
        return await this.createLinkNode(change)

      case 'update':
        if (!mapping) {
          // Unknown file updated - might be a new file we haven't mapped yet
          return await this.createLinkNode(change)
        }
        return await this.updateLinkNode(mapping, change)

      case 'delete':
        if (!mapping) {
          return { success: true, action: 'no_op' }
        }
        return await this.deleteNode(mapping)
    }
  }

  private async createLinkNode(change: FileChange): Promise<SyncResult> {
    // Parse .url.yaml content
    const content = change.content || ''
    let parsed: { url?: string; title?: string; description?: string; siteName?: string; displayMode?: string }
    try {
      parsed = yaml.parse(content) || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .url.yaml file' }
    }

    if (!parsed.url) {
      return { success: false, action: 'error', error: 'No URL found in .url.yaml file' }
    }

    const parentInfo = this.pathMapper.resolveNewFile(change.path)
    if (!parentInfo) {
      return {
        success: false,
        action: 'error',
        error: 'Cannot determine parent canvas for new link file',
      }
    }

    const canvas = this.findCanvasById(parentInfo.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${parentInfo.canvasId}`,
      }
    }

    // Generate new node ID
    const nodeId = crypto.randomUUID()

    // Strip .url.yaml extension from node name and enforce lower-kebab-case
    const nodeName = sanitizeFilename(parentInfo.nodeName.replace(/\.url\.yaml$/, ''))

    // Create node data - only include defined fields (valtio-y doesn't allow undefined)
    const nodeData: LinkNodeData = {
      url: parsed.url,
      loadingStatus: 'pending',
    }
    // Include any metadata if agent provided it
    if (parsed.title !== undefined) nodeData.title = parsed.title
    if (parsed.description !== undefined) nodeData.description = parsed.description
    if (parsed.siteName !== undefined) nodeData.siteName = parsed.siteName
    nodeData.displayMode = parsed.displayMode === 'iframe' ? 'iframe' : 'preview'

    const nodeItem: NodeItem = {
      kind: 'node',
      id: nodeId,
      name: nodeName,
      xynode: {
        id: nodeId,
        type: 'link' as const,
        position: { x: 0, y: 0 },
        data: nodeData,
      },
    }

    this.applySectionToNode(change, canvas, nodeItem)
    this.markCreatedNodeForFrontendPlacement(change, nodeItem)

    this.stampCreateAuditNode(nodeItem)
    this.touchCanvas(canvas)

    // Add to canvas items
    canvas.items.push(nodeItem)

    // Update path mapper
    this.pathMapper.addMapping({
      path: change.path,
      nodeId,
      canvasId: parentInfo.canvasId,
      originalName: nodeName,
      type: 'node',
    })

    return { success: true, action: 'created_node', nodeId, canvasId: parentInfo.canvasId, node: nodeItem }
  }

  private async updateLinkNode(mapping: PathMapping, change: FileChange): Promise<SyncResult> {
    // Parse the new content
    let parsed: { url?: string; title?: string; description?: string; siteName?: string; displayMode?: string }
    try {
      parsed = yaml.parse(change.content || '') || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .url.yaml file' }
    }

    // Find the canvas and node
    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${mapping.canvasId}`,
      }
    }

    const nodeItem = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === mapping.nodeId)
    if (!nodeItem || nodeItem.xynode.type !== 'link') {
      return {
        success: false,
        action: 'error',
        error: `Link node not found: ${mapping.nodeId}`,
      }
    }

    // Update the node data
    const nodeData = nodeItem.xynode.data as LinkNodeData
    if (!parsed.url) {
      return { success: false, action: 'error', error: 'No URL found in .url.yaml file' }
    }

    nodeData.url = parsed.url

    if (parsed.title !== undefined) nodeData.title = parsed.title
    else delete nodeData.title

    if (parsed.description !== undefined) nodeData.description = parsed.description
    else delete nodeData.description

    if (parsed.siteName !== undefined) nodeData.siteName = parsed.siteName
    else delete nodeData.siteName

    nodeData.displayMode = parsed.displayMode === 'iframe' ? 'iframe' : 'preview'

    this.applySectionToNode(change, canvas, nodeItem)

    this.touchNodeAndCanvas(nodeItem, canvas)

    return { success: true, action: 'updated_content', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  private async deleteNode(mapping: PathMapping): Promise<SyncResult> {
    // Find the parent canvas
    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${mapping.canvasId}`,
      }
    }

    // Remove from canvas items
    const index = canvas.items.findIndex((i) => i.kind === 'node' && i.id === mapping.nodeId)
    if (index !== -1) {
      canvas.items.splice(index, 1)
    }

    // Clean up content based on node type
    this.contentStore.deleteNoteDoc(mapping.nodeId)

    // Remove edges that reference this node
    canvas.edges = canvas.edges.filter((edge) => edge.source !== mapping.nodeId && edge.target !== mapping.nodeId)

    this.removeNodeFromGroups(canvas, mapping.nodeId)
    this.removeNodeFromSections(canvas, mapping.nodeId)

    // Update path mapper
    this.pathMapper.removeByPath(mapping.path)

    this.touchCanvas(canvas)

    return { success: true, action: 'deleted_node', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  // ============================================================================
  // TEXT FILE SYNC (.text.yaml)
  // ============================================================================

  private async syncTextFile(change: FileChange): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(change.path)

    switch (change.type) {
      case 'create':
        if (mapping) {
          return this.updateTextNode(mapping, change)
        }
        return this.createTextNode(change)
      case 'update':
        if (!mapping) {
          return this.createTextNode(change)
        }
        return this.updateTextNode(mapping, change)
      case 'delete':
        if (!mapping) {
          return { success: true, action: 'no_op' }
        }
        return await this.deleteNode(mapping)
    }
  }

  private createTextNode(change: FileChange): SyncResult {
    const content = change.content || ''
    let parsed: Record<string, unknown>
    try {
      parsed = yaml.parse(content) || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .text.yaml file' }
    }

    const parentInfo = this.pathMapper.resolveNewFile(change.path)
    if (!parentInfo) {
      return { success: false, action: 'error', error: 'Cannot determine parent canvas for new text file' }
    }

    const canvas = this.findCanvasById(parentInfo.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${parentInfo.canvasId}` }
    }

    const nodeId = crypto.randomUUID()
    const nodeName = sanitizeFilename(parentInfo.nodeName.replace(/\.text\.yaml$/, ''))

    const nodeData: TextNodeData = {
      content: parsed.content === undefined ? '' : String(parsed.content),
    }
    if (parsed.fontSize !== undefined) nodeData.fontSize = Number(parsed.fontSize)
    if (parsed.fontFamily !== undefined) nodeData.fontFamily = parsed.fontFamily as TextNodeData['fontFamily']
    if (parsed.color !== undefined) nodeData.color = String(parsed.color)

    const nodeItem: NodeItem = {
      kind: 'node',
      id: nodeId,
      name: nodeName,
      xynode: {
        id: nodeId,
        type: 'text' as const,
        position: { x: 0, y: 0 },
        data: nodeData,
      },
    }

    this.applySectionToNode(change, canvas, nodeItem)
    this.markCreatedNodeForFrontendPlacement(change, nodeItem)

    this.stampCreateAuditNode(nodeItem)
    this.touchCanvas(canvas)
    canvas.items.push(nodeItem)

    this.pathMapper.addMapping({
      path: change.path,
      nodeId,
      canvasId: parentInfo.canvasId,
      originalName: nodeName,
      type: 'node',
    })

    return { success: true, action: 'created_node', nodeId, canvasId: parentInfo.canvasId, node: nodeItem }
  }

  private updateTextNode(mapping: PathMapping, change: FileChange): SyncResult {
    let parsed: Record<string, unknown>
    try {
      parsed = yaml.parse(change.content || '') || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .text.yaml file' }
    }

    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${mapping.canvasId}` }
    }

    const nodeItem = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === mapping.nodeId)
    if (!nodeItem || nodeItem.xynode.type !== 'text') {
      return { success: false, action: 'error', error: `Text node not found: ${mapping.nodeId}` }
    }

    const nodeData = nodeItem.xynode.data as TextNodeData
    nodeData.content = parsed.content === undefined ? '' : String(parsed.content)
    if (parsed.fontSize !== undefined) nodeData.fontSize = Number(parsed.fontSize)
    else delete nodeData.fontSize
    if (parsed.fontFamily !== undefined) nodeData.fontFamily = parsed.fontFamily as TextNodeData['fontFamily']
    else delete nodeData.fontFamily
    if (parsed.color !== undefined) nodeData.color = String(parsed.color)
    else delete nodeData.color

    this.applySectionToNode(change, canvas, nodeItem)

    this.touchNodeAndCanvas(nodeItem, canvas)
    return { success: true, action: 'updated_content', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  // ============================================================================
  // STICKY NOTE FILE SYNC (.sticky.yaml)
  // ============================================================================

  private async syncStickyNoteFile(change: FileChange): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(change.path)

    switch (change.type) {
      case 'create':
        if (mapping) return await this.updateStickyNoteNode(mapping, change)
        return await this.createStickyNoteNode(change)
      case 'update':
        if (!mapping) return await this.createStickyNoteNode(change)
        return await this.updateStickyNoteNode(mapping, change)
      case 'delete':
        if (!mapping) return { success: true, action: 'no_op' }
        return await this.deleteNode(mapping)
    }
  }

  private async createStickyNoteNode(change: FileChange): Promise<SyncResult> {
    const content = change.content || ''
    let parsed: Record<string, unknown>
    try {
      parsed = yaml.parse(content) || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .sticky.yaml file' }
    }

    const parentInfo = this.pathMapper.resolveNewFile(change.path)
    if (!parentInfo) {
      return { success: false, action: 'error', error: 'Cannot determine parent canvas for new sticky note' }
    }

    const canvas = this.findCanvasById(parentInfo.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${parentInfo.canvasId}` }
    }

    const nodeId = crypto.randomUUID()
    const stickyContent = parsed.content === undefined ? '' : String(parsed.content)

    // Create note doc and populate BlockNote fragment from markdown content
    this.contentStore.createNoteDoc(nodeId, 'stickyNote')
    const fragment = this.contentStore.getBlockNoteFragment(nodeId)
    if (!fragment) {
      this.contentStore.deleteNoteDoc(nodeId)
      return { success: false, action: 'error', error: `Failed to create sticky note doc for node ${nodeId}` }
    }

    try {
      await this.contentConverter.updateFragmentFromMarkdown(fragment, stickyContent, {
        nodeId,
        source: 'FilesystemSyncer.createStickyNoteNode',
      })
    } catch (error) {
      this.contentStore.deleteNoteDoc(nodeId)
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, action: 'error', error: `Failed to initialize sticky note content: ${message}` }
    }

    const nodeName = sanitizeFilename(parentInfo.nodeName.replace(/\.sticky\.yaml$/, ''))

    const nodeData: StickyNoteNodeData = {}
    if (parsed.color !== undefined) nodeData.color = parsed.color as StickyNoteNodeData['color']
    if (parsed.fontFamily !== undefined) nodeData.fontFamily = parsed.fontFamily as StickyNoteNodeData['fontFamily']

    const nodeItem: NodeItem = {
      kind: 'node',
      id: nodeId,
      name: nodeName,
      xynode: {
        id: nodeId,
        type: 'stickyNote' as const,
        position: { x: 0, y: 0 },
        data: nodeData,
      },
    }

    this.applySectionToNode(change, canvas, nodeItem)
    this.markCreatedNodeForFrontendPlacement(change, nodeItem)

    this.stampCreateAuditNode(nodeItem)
    this.touchCanvas(canvas)
    canvas.items.push(nodeItem)

    this.pathMapper.addMapping({
      path: change.path,
      nodeId,
      canvasId: parentInfo.canvasId,
      originalName: nodeName,
      type: 'node',
    })

    return { success: true, action: 'created_node', nodeId, canvasId: parentInfo.canvasId, node: nodeItem }
  }

  private async updateStickyNoteNode(mapping: PathMapping, change: FileChange): Promise<SyncResult> {
    let parsed: Record<string, unknown>
    try {
      parsed = yaml.parse(change.content || '') || {}
    } catch {
      return { success: false, action: 'error', error: 'Invalid YAML in .sticky.yaml file' }
    }

    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${mapping.canvasId}` }
    }

    const nodeItem = canvas.items.find((i): i is NodeItem => i.kind === 'node' && i.id === mapping.nodeId)
    if (!nodeItem || nodeItem.xynode.type !== 'stickyNote') {
      return { success: false, action: 'error', error: `Sticky note node not found: ${mapping.nodeId}` }
    }

    const nodeData = nodeItem.xynode.data as StickyNoteNodeData
    if (parsed.color !== undefined) nodeData.color = parsed.color as StickyNoteNodeData['color']
    else delete nodeData.color
    if (parsed.fontFamily !== undefined) nodeData.fontFamily = parsed.fontFamily as StickyNoteNodeData['fontFamily']
    else delete nodeData.fontFamily

    // Update BlockNote fragment from markdown content
    const fragment = this.contentStore.getBlockNoteFragment(mapping.nodeId)
    if (!fragment) {
      return {
        success: false,
        action: 'error',
        error: `Sticky note ${mapping.nodeId} is missing attached note content`,
      }
    }

    await this.contentConverter.updateFragmentFromMarkdown(
      fragment,
      parsed.content === undefined ? '' : String(parsed.content),
      {
        nodeId: mapping.nodeId,
        source: 'FilesystemSyncer.updateStickyNoteNode',
      }
    )

    this.applySectionToNode(change, canvas, nodeItem)

    this.touchNodeAndCanvas(nodeItem, canvas)
    return { success: true, action: 'updated_content', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  // ============================================================================
  // BINARY FILE SYNC
  // ============================================================================

  private async syncBinaryFile(
    change: FileChange,
    fileInfo: { nodeType: string; mimeType: string }
  ): Promise<SyncResult> {
    switch (change.type) {
      case 'create':
        return await this.createBinaryNode(change, fileInfo)
      case 'update': {
        const mapping = this.pathMapper.getMapping(change.path)
        if (!mapping) {
          return { success: true, action: 'no_op' }
        }
        return await this.updateBinaryNode(mapping, change, fileInfo)
      }
      case 'delete':
        return await this.deleteBinaryNode(change)
    }
  }

  private async updateBinaryNode(
    mapping: PathMapping,
    change: FileChange,
    fileInfo: { nodeType: string; mimeType: string }
  ): Promise<SyncResult> {
    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${mapping.canvasId}`,
      }
    }

    const existingNode = canvas.items.find(
      (item): item is NodeItem => item.kind === 'node' && item.id === mapping.nodeId
    )
    if (!existingNode) {
      return {
        success: false,
        action: 'error',
        error: `Node not found: ${mapping.nodeId}`,
      }
    }

    if (!isBinaryNodeType(existingNode.xynode.type)) {
      return { success: true, action: 'no_op', nodeId: existingNode.id, canvasId: mapping.canvasId }
    }

    let fileBuffer: Buffer
    try {
      fileBuffer = await this.fileReader(change.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, action: 'error', error: `Failed to read file: ${message}` }
    }

    const filename = change.path.split('/').pop() || 'file'

    let uploadResult: FileUploadResult
    try {
      uploadResult = await this.fileUploader(fileBuffer, mapping.canvasId, filename, fileInfo.mimeType)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, action: 'error', error: `Failed to upload: ${message}` }
    }

    const contentHash = createHash('sha256').update(fileBuffer).digest('hex')

    if (existingNode.xynode.type === 'image') {
      const existingData = existingNode.xynode.data as ImageNodeData
      const dimensions = getImageDimensionsFromBuffer(fileBuffer)
      existingNode.xynode.data = {
        ...existingData,
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        contentHash,
        width: dimensions?.width,
        height: dimensions?.height,
      }
    } else if (existingNode.xynode.type === 'audio') {
      const existingData = existingNode.xynode.data as AudioNodeData
      existingNode.xynode.data = {
        ...existingData,
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename,
        contentHash,
      }
    } else {
      const existingData = existingNode.xynode.data as FileNodeData
      existingNode.xynode.data = {
        ...existingData,
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename,
        contentHash,
      }
    }

    this.applySectionToNode(change, canvas, existingNode)
    this.touchNodeAndCanvas(existingNode, canvas)

    return {
      success: true,
      action: 'updated_binary_content',
      nodeId: existingNode.id,
      canvasId: mapping.canvasId,
      node: existingNode,
    }
  }

  private async createBinaryNode(
    change: FileChange,
    fileInfo: { nodeType: string; mimeType: string }
  ): Promise<SyncResult> {
    let parentInfo = this.pathMapper.resolveNewFile(change.path)
    if (!parentInfo && this.autoCreateCanvases) {
      const result = await this.ensureParentCanvas(change.path)
      if (!result.success) return result
      parentInfo = this.pathMapper.resolveNewFile(change.path)
    }
    if (!parentInfo) {
      return {
        success: false,
        action: 'error',
        error: 'Cannot determine parent canvas for new binary file',
      }
    }

    const canvas = this.findCanvasById(parentInfo.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${parentInfo.canvasId}`,
      }
    }

    // Check if this file is already mapped (existing node)
    const existingMapping = this.pathMapper.getMapping(change.path)
    if (existingMapping) {
      // Atomic-save pattern: create on existing path behaves as update
      return await this.updateBinaryNode(existingMapping, change, fileInfo)
    }

    // Read file binary using the provided reader
    let fileBuffer: Buffer
    try {
      fileBuffer = await this.fileReader(change.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        action: 'error',
        error: `Failed to read binary file: ${message}`,
      }
    }

    const filename = change.path.split('/').pop() || 'file'

    // Upload to storage
    let uploadResult: FileUploadResult
    try {
      uploadResult = await this.fileUploader(fileBuffer, parentInfo.canvasId, filename, fileInfo.mimeType)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        action: 'error',
        error: `Failed to upload binary file: ${message}`,
      }
    }

    // Compute content hash using SHA-256
    const contentHash = createHash('sha256').update(fileBuffer).digest('hex')

    // Generate node ID
    const nodeId = crypto.randomUUID()

    // Strip file extension from name and enforce lower-kebab-case
    const nameWithoutExt = sanitizeFilename(parentInfo.nodeName.replace(/\.[^.]+$/, ''))

    let nodeItem: NodeItem

    if (fileInfo.nodeType === 'image') {
      // IMAGE NODE - with dimensions and resizable width
      // Get image dimensions from buffer
      const dimensions = getImageDimensionsFromBuffer(fileBuffer)
      const displaySize = dimensions
        ? calculateImageDisplaySize(dimensions.width, dimensions.height)
        : IMAGE_NODE_LAYOUT.DEFAULT_MEASURED

      // Create node data with natural dimensions
      const nodeData: ImageNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        width: dimensions?.width,
        height: dimensions?.height,
        contentHash,
      }

      nodeItem = {
        kind: 'node',
        id: nodeId,
        name: nameWithoutExt,
        xynode: {
          id: nodeId,
          type: 'image' as const,
          position: { x: 0, y: 0 },
          data: nodeData,
          width: displaySize.width,
          height: displaySize.height,
          measured: { ...displaySize },
        },
      }
    } else if (fileInfo.nodeType === 'audio') {
      // AUDIO NODE - fixed size, similar to file but different type
      const nodeData: AudioNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename, // Keep full filename with extension for display
        contentHash,
      }

      nodeItem = {
        kind: 'node',
        id: nodeId,
        name: nameWithoutExt,
        xynode: {
          id: nodeId,
          type: 'audio' as const,
          position: { x: 0, y: 0 },
          data: nodeData,
        },
      }
    } else {
      // FILE NODE - fixed size, no dimensions needed
      const nodeData: FileNodeData = {
        storagePath: uploadResult.storagePath,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        originalFilename: filename, // Keep full filename with extension for display
        contentHash,
      }

      nodeItem = {
        kind: 'node',
        id: nodeId,
        name: nameWithoutExt,
        xynode: {
          id: nodeId,
          type: 'file' as const,
          position: { x: 0, y: 0 },
          data: nodeData,
        },
      }
    }

    this.applySectionToNode(change, canvas, nodeItem)
    this.markCreatedNodeForFrontendPlacement(change, nodeItem)

    // Add to canvas items
    canvas.items.push(nodeItem)

    this.stampCreateAuditNode(nodeItem)
    this.touchCanvas(canvas)

    // Update path mapper
    this.pathMapper.addMapping({
      path: change.path,
      nodeId,
      canvasId: parentInfo.canvasId,
      originalName: parentInfo.nodeName,
      type: 'node',
    })

    return { success: true, action: 'created_node', nodeId, canvasId: parentInfo.canvasId, node: nodeItem }
  }

  private async deleteBinaryNode(change: FileChange): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(change.path)
    if (!mapping) {
      return { success: true, action: 'no_op' }
    }

    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Parent canvas not found: ${mapping.canvasId}`,
      }
    }

    // Remove node from canvas items
    const index = canvas.items.findIndex((i) => i.kind === 'node' && i.id === mapping.nodeId)
    if (index !== -1) {
      canvas.items.splice(index, 1)
    }

    // Remove edges that reference this node
    canvas.edges = canvas.edges.filter((edge) => edge.source !== mapping.nodeId && edge.target !== mapping.nodeId)

    this.removeNodeFromGroups(canvas, mapping.nodeId)
    this.removeNodeFromSections(canvas, mapping.nodeId)

    // Note: We don't delete from R2 storage here - orphaned files can be cleaned up later

    // Update path mapper
    this.pathMapper.removeByPath(mapping.path)

    this.touchCanvas(canvas)

    return { success: true, action: 'deleted_node', nodeId: mapping.nodeId, canvasId: mapping.canvasId }
  }

  // ============================================================================
  // METADATA SYNC
  // ============================================================================

  private async syncMetadata(change: FileChange): Promise<SyncResult> {
    if (change.type === 'delete') {
      // Metadata deleted - canvas might be getting removed
      // The canvas deletion is handled separately
      return { success: true, action: 'no_op' }
    }

    if (!change.content) {
      return { success: false, action: 'error', error: 'No content for metadata file' }
    }

    let metadata: CanvasMetadata
    try {
      metadata = this.parseAndValidateMetadata(change.content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, action: 'error', error: message }
    }

    const canvas = this.findCanvasById(metadata.id)
    if (!canvas) {
      return {
        success: false,
        action: 'error',
        error: `Canvas not found: ${metadata.id}`,
      }
    }

    const { canvasChanged, changedNodeIds } = this.applyMetadataToCanvas(canvas, metadata)
    this.touchMetadataAuditTargets(canvas, changedNodeIds, canvasChanged)

    return {
      success: true,
      action: 'updated_metadata',
      canvasId: metadata.id,
      changedNodeIds: Array.from(changedNodeIds),
      canvasChanged,
    }
  }

  // ============================================================================
  // CANVAS SYNC
  // ============================================================================

  private async syncCanvas(change: FileChange): Promise<SyncResult> {
    const canvasInfo = this.pathMapper.resolveNewCanvas(change.path)

    switch (change.type) {
      case 'create':
        if (canvasInfo) {
          return await this.createCanvas(change.path, canvasInfo)
        }
        return { success: true, action: 'no_op' }

      case 'delete':
        return await this.deleteCanvas(change.path)

      default:
        return { success: true, action: 'no_op' }
    }
  }

  /**
   * Auto-create missing parent canvases for a file path.
   * Walks up from the file's parent directory and creates canvases top-down.
   */
  private async ensureParentCanvas(filePath: string): Promise<SyncResult> {
    const parts = filePath.split('/')
    // Remove filename, keep directory segments
    const dirParts = parts.slice(0, -1)

    // Find the deepest existing canvas, then create missing ones top-down
    const toCreate: string[] = []
    for (let i = dirParts.length; i > 0; i--) {
      const dirPath = dirParts.slice(0, i).join('/')
      if (this.pathMapper.getCanvasMapping(dirPath)) break
      toCreate.unshift(dirPath)
    }

    for (const dirPath of toCreate) {
      const segments = dirPath.split('/')
      const canvasName = segments[segments.length - 1]
      const parentPath = segments.slice(0, -1).join('/')

      const result = await this.createCanvas(dirPath, { parentPath, canvasName })
      if (!result.success) return result
    }

    return { success: true, action: 'no_op' }
  }

  private async createCanvas(
    path: string,
    canvasInfo: { parentPath: string; canvasName: string }
  ): Promise<SyncResult> {
    const canvasId = crypto.randomUUID()

    // Find parent canvas first to calculate position
    let parentCanvas: CanvasItem | undefined
    if (canvasInfo.parentPath) {
      const parentMapping = this.pathMapper.getCanvasMapping(canvasInfo.parentPath)
      if (!parentMapping) {
        return {
          success: false,
          action: 'error',
          error: `Parent canvas not found at path: ${canvasInfo.parentPath}`,
        }
      }
      parentCanvas = this.findCanvasById(parentMapping.canvasId)
      if (!parentCanvas) {
        return {
          success: false,
          action: 'error',
          error: `Parent canvas not found: ${parentMapping.canvasId}`,
        }
      }
    } else {
      parentCanvas = this.proxy.root
      if (!parentCanvas) {
        return {
          success: false,
          action: 'error',
          error: 'No root canvas exists',
        }
      }
    }

    // Calculate vertical position based on existing canvas items
    const existingCanvasItems = parentCanvas.items.filter((i) => i.kind === 'canvas')
    const position = calculateItemPosition(existingCanvasItems, {
      direction: 'vertical',
      defaultSize: CANVAS_NODE_LAYOUT.HEIGHT,
    })

    // Create new canvas item with xynode
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: canvasId,
      name: sanitizeFilename(canvasInfo.canvasName),
      xynode: {
        id: canvasId,
        type: 'canvas',
        position,
        data: {},
      },
      edges: [],
      items: [],
      groups: [],
      sections: [],
    }

    this.stampCreateAuditCanvas(canvas)

    // Add to parent canvas
    parentCanvas.items.push(canvas)
    this.touchCanvas(parentCanvas)

    // Update path mapper
    this.pathMapper.addCanvasMapping({
      path,
      canvasId,
      originalName: canvasInfo.canvasName,
    })

    return { success: true, action: 'created_canvas', canvasId, parentCanvasId: parentCanvas.id, canvas }
  }

  private async deleteCanvas(path: string): Promise<SyncResult> {
    const canvasMapping = this.pathMapper.getCanvasMapping(path)
    if (!canvasMapping) {
      return { success: true, action: 'no_op' }
    }

    // Prevent deletion of root canvas
    if (canvasMapping.canvasId === 'root' || canvasMapping.canvasId === this.proxy.root?.id) {
      return {
        success: false,
        action: 'error',
        error: 'Cannot delete root canvas',
      }
    }

    // Find and remove the canvas from its parent
    const removal = this.removeCanvasFromTree(canvasMapping.canvasId)
    if (!removal) {
      return {
        success: false,
        action: 'error',
        error: `Canvas not found in tree: ${canvasMapping.canvasId}`,
      }
    }

    // Recursively clean up all contents
    this.cleanupCanvasContents(removal.removed)

    // Remove canvas from path mapper
    this.pathMapper.removeCanvasByPath(path)

    // Structural delete mutates the parent canvas
    this.touchCanvas(removal.parent)

    return {
      success: true,
      action: 'deleted_canvas',
      canvasId: canvasMapping.canvasId,
      parentCanvasId: removal.parent.id,
    }
  }

  private async renameNodeFile(oldPath: string, newPath: string): Promise<SyncResult> {
    const mapping = this.pathMapper.getMapping(oldPath)
    if (!mapping) {
      return { success: true, action: 'no_op' }
    }

    const nodeKind = this.classifyNodePath(oldPath)
    if (nodeKind === null || nodeKind !== this.classifyNodePath(newPath)) {
      return { success: false, action: 'error', error: 'Renamed file changed node type and cannot preserve identity' }
    }

    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${mapping.canvasId}` }
    }

    const nodeItem = canvas.items.find((item): item is NodeItem => item.kind === 'node' && item.id === mapping.nodeId)
    if (!nodeItem) {
      return { success: false, action: 'error', error: `Node not found: ${mapping.nodeId}` }
    }

    const newParentInfo = this.pathMapper.resolveNewFile(newPath)
    if (!newParentInfo) {
      return { success: false, action: 'error', error: 'Cannot determine parent canvas for renamed file' }
    }

    const newCanvas = this.findCanvasById(newParentInfo.canvasId)
    if (!newCanvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${newParentInfo.canvasId}` }
    }

    const nextName = sanitizeFilename(this.stripNodeExtension(newParentInfo.nodeName, nodeKind))
    const affectedCanvasIds = Array.from(new Set([mapping.canvasId, newParentInfo.canvasId]))

    if (mapping.canvasId !== newParentInfo.canvasId) {
      const index = canvas.items.findIndex((item) => item.kind === 'node' && item.id === mapping.nodeId)
      if (index === -1) {
        return { success: false, action: 'error', error: `Node not found: ${mapping.nodeId}` }
      }

      canvas.items.splice(index, 1)
      this.removeNodeFromGroups(canvas, mapping.nodeId)
      this.removeNodeFromSections(canvas, mapping.nodeId)
      this.setNodeSectionId(nodeItem, undefined)
      this.setPendingCanvasPlacement(nodeItem, 'moved')
      newCanvas.items.push(nodeItem)
      this.touchCanvas(canvas)
      this.touchNodeAndCanvas(nodeItem, newCanvas)
    } else {
      this.touchNodeAndCanvas(nodeItem, canvas)
    }

    nodeItem.name = nextName

    this.pathMapper.replaceMapping(oldPath, {
      path: newPath,
      nodeId: mapping.nodeId,
      canvasId: newParentInfo.canvasId,
      originalName: nextName,
      type: 'node',
    })

    return {
      success: true,
      action: 'renamed_node',
      nodeId: mapping.nodeId,
      canvasId: newParentInfo.canvasId,
      affectedCanvasIds,
    }
  }

  private async renameCanvas(oldPath: string, newPath: string): Promise<SyncResult> {
    const mapping = this.pathMapper.getCanvasMapping(oldPath)
    if (!mapping) {
      return { success: true, action: 'no_op' }
    }

    if (mapping.canvasId === 'root' || mapping.canvasId === this.proxy.root?.id) {
      return { success: false, action: 'error', error: 'Cannot rename root canvas' }
    }

    const canvas = this.findCanvasById(mapping.canvasId)
    if (!canvas) {
      return { success: false, action: 'error', error: `Canvas not found: ${mapping.canvasId}` }
    }

    const oldParentPath = oldPath.split('/').slice(0, -1).join('/')
    const newCanvasInfo = this.pathMapper.resolveNewCanvas(newPath)
    if (!newCanvasInfo) {
      return { success: false, action: 'error', error: 'Cannot determine parent canvas for renamed canvas' }
    }

    const oldParentMapping = this.pathMapper.getCanvasMapping(oldParentPath)
    const oldParentCanvas =
      oldParentPath.length === 0 ? this.proxy.root : oldParentMapping && this.findCanvasById(oldParentMapping.canvasId)
    if (!oldParentCanvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${oldParentPath}` }
    }

    const newParentMapping = this.pathMapper.getCanvasMapping(newCanvasInfo.parentPath)
    const newParentCanvas =
      newCanvasInfo.parentPath.length === 0
        ? this.proxy.root
        : newParentMapping && this.findCanvasById(newParentMapping.canvasId)
    if (!newParentCanvas) {
      return { success: false, action: 'error', error: `Parent canvas not found: ${newCanvasInfo.parentPath}` }
    }

    canvas.name = sanitizeFilename(newCanvasInfo.canvasName)

    if (oldParentCanvas.id !== newParentCanvas.id) {
      const index = oldParentCanvas.items.findIndex((item) => item.kind === 'canvas' && item.id === canvas.id)
      if (index === -1) {
        return { success: false, action: 'error', error: `Canvas not found in parent: ${mapping.canvasId}` }
      }

      oldParentCanvas.items.splice(index, 1)
      newParentCanvas.items.push(canvas)
      this.touchCanvas(oldParentCanvas)
      this.touchCanvas(newParentCanvas)
    } else {
      this.touchCanvas(newParentCanvas)
    }

    this.touchCanvas(canvas)
    this.pathMapper.replaceCanvasMapping(oldPath, {
      path: newPath,
      canvasId: mapping.canvasId,
      originalName: canvas.name,
    })

    return {
      success: true,
      action: 'renamed_canvas',
      canvasId: mapping.canvasId,
      parentCanvasId: newParentCanvas.id,
      affectedCanvasIds: Array.from(new Set([canvas.id, oldParentCanvas.id, newParentCanvas.id])),
    }
  }

  private classifyNodePath(path: string): 'markdown' | 'text' | 'sticky' | 'url' | 'binary' | null {
    if (path.endsWith('.sticky.yaml')) return 'sticky'
    if (path.endsWith('.text.yaml')) return 'text'
    if (path.endsWith('.url.yaml')) return 'url'
    if (path.endsWith('.md')) return 'markdown'
    return this.getBinaryFileInfo(path) ? 'binary' : null
  }

  private stripNodeExtension(filename: string, nodeKind: 'markdown' | 'text' | 'sticky' | 'url' | 'binary'): string {
    switch (nodeKind) {
      case 'markdown':
        return filename.replace(/\.md$/, '')
      case 'text':
        return filename.replace(/\.text\.yaml$/, '')
      case 'sticky':
        return filename.replace(/\.sticky\.yaml$/, '')
      case 'url':
        return filename.replace(/\.url\.yaml$/, '')
      case 'binary': {
        const lastDot = filename.lastIndexOf('.')
        return lastDot === -1 ? filename : filename.slice(0, lastDot)
      }
    }
  }

  /**
   * Recursively clean up all nodes and child canvases within a canvas.
   */
  private cleanupCanvasContents(canvas: CanvasItem): void {
    for (const item of canvas.items) {
      if (item.kind === 'node') {
        // Clean up node content
        this.contentStore.deleteNoteDoc(item.id)
        const nodePath = this.pathMapper.getPathForNode(item.id)
        if (nodePath) {
          this.pathMapper.removeByPath(nodePath)
        }
      } else if (item.kind === 'canvas') {
        // Recursively clean up child canvas
        this.cleanupCanvasContents(item)
        const canvasPath = this.pathMapper.getPathForCanvas(item.id)
        if (canvasPath) {
          this.pathMapper.removeCanvasByPath(canvasPath)
        }
      }
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private stampCreateAuditNode(nodeItem: NodeItem): void {
    if (!this.auditActor) return
    stampCreateAuditOnNode(nodeItem, this.auditActor, this.now())
  }

  private stampCreateAuditCanvas(canvas: CanvasItem): void {
    if (!this.auditActor) return
    stampCreateAuditOnCanvas(canvas, this.auditActor, this.now())
  }

  private touchNodeAndCanvas(nodeItem: NodeItem, canvas: CanvasItem): void {
    if (!this.auditActor) return

    const now = this.now()
    touchAuditIfNodeUpdated(nodeItem, this.auditActor, now)
    touchAuditIfCanvasUpdated(canvas, this.auditActor, now)
  }

  private touchCanvas(canvas: CanvasItem): void {
    if (!this.auditActor) return
    touchAuditIfCanvasUpdated(canvas, this.auditActor, this.now())
  }

  private applyMetadataToCanvas(canvas: CanvasItem, metadata: CanvasMetadata): MetadataApplyResult {
    const canvasPositionOrSizeChanged = this.applyCanvasGeometryFromMetadata(canvas, metadata.xynode)
    const edgesChanged = this.applyCanvasEdgesFromMetadata(canvas, metadata.edges)
    const groupsChanged = this.applyCanvasGroupsFromMetadata(canvas, metadata.groups)
    const sectionsChanged = this.applyCanvasSectionsFromMetadata(canvas, metadata.sections)
    const changedNodeIds = this.applyMetadataToNodes(canvas, metadata.nodes)

    return {
      canvasChanged: canvasPositionOrSizeChanged || edgesChanged || groupsChanged || sectionsChanged,
      changedNodeIds,
    }
  }

  private applyCanvasGeometryFromMetadata(canvas: CanvasItem, metadataXynode: CanvasMetadata['xynode']): boolean {
    let changed = false

    if (
      canvas.xynode.position.x !== metadataXynode.position.x ||
      canvas.xynode.position.y !== metadataXynode.position.y
    ) {
      canvas.xynode.position = metadataXynode.position
      changed = true
    }

    return changed
  }

  private applyCanvasEdgesFromMetadata(canvas: CanvasItem, metadataEdges: CanvasMetadata['edges']): boolean {
    const nextEdges = metadataEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }))

    const edgesChanged =
      canvas.edges.length !== nextEdges.length ||
      canvas.edges.some((edge, index) => {
        const next = nextEdges[index]
        return !next || edge.id !== next.id || edge.source !== next.source || edge.target !== next.target
      })

    if (!edgesChanged) {
      return false
    }

    canvas.edges = nextEdges
    return true
  }

  private applyCanvasGroupsFromMetadata(canvas: CanvasItem, metadataGroups: CanvasMetadata['groups']): boolean {
    if (!metadataGroups || metadataGroups.length === 0) {
      if (!canvas.groups || canvas.groups.length === 0) return false
      canvas.groups = []
      return true
    }

    const current = canvas.groups ?? []
    const changed =
      current.length !== metadataGroups.length ||
      current.some((g, i) => {
        const next = metadataGroups[i]
        return (
          !next ||
          g.id !== next.id ||
          g.name !== next.name ||
          g.position.x !== next.position.x ||
          g.position.y !== next.position.y ||
          g.memberIds.length !== next.memberIds.length ||
          g.memberIds.some((mid, j) => mid !== next.memberIds[j]) ||
          g.color !== next.color ||
          g.columns !== next.columns
        )
      })

    if (!changed) return false

    // Validate memberIds — strip references to nodes that don't exist
    const nodeIds = new Set(canvas.items.filter((i) => i.kind === 'node').map((i) => i.id))
    const validatedGroups = metadataGroups
      .map((g) => ({ ...g, memberIds: g.memberIds.filter((mid) => nodeIds.has(mid)) }))
      .filter((g) => g.memberIds.length > 0)

    canvas.groups = validatedGroups
    return true
  }

  private applyCanvasSectionsFromMetadata(canvas: CanvasItem, metadataSections: CanvasMetadata['sections']): boolean {
    if (!metadataSections || metadataSections.length === 0) {
      if (!canvas.sections || canvas.sections.length === 0) return false
      canvas.sections = []
      return true
    }

    const current = canvas.sections ?? []
    const changed =
      current.length !== metadataSections.length ||
      current.some((section, index) => {
        const next = metadataSections[index]
        return (
          !next ||
          section.id !== next.id ||
          section.title !== next.title ||
          section.layout !== next.layout ||
          section.columns !== next.columns ||
          section.pendingPlacement?.mode !== next.pendingPlacement?.mode ||
          section.pendingPlacement?.anchorSectionTitle !== next.pendingPlacement?.anchorSectionTitle ||
          section.pendingPlacement?.gap !== next.pendingPlacement?.gap ||
          section.memberIds.length !== next.memberIds.length ||
          section.memberIds.some((memberId, memberIndex) => memberId !== next.memberIds[memberIndex])
        )
      })

    if (!changed) {
      return false
    }

    const nodeIds = new Set(canvas.items.filter((item) => item.kind === 'node').map((item) => item.id))
    const currentSectionPositions = new Map(current.map((section) => [section.id, { ...section.position }]))
    const validatedSections = metadataSections
      .map((section) => ({
        ...section,
        // Section positions are runtime-owned because collision resolution moves them live.
        position: currentSectionPositions.get(section.id) ?? { ...section.position },
        memberIds: section.memberIds.filter((memberId) => nodeIds.has(memberId)),
      }))
      .filter((section) => section.memberIds.length > 0)

    canvas.sections = validatedSections
    return true
  }

  private applyMetadataToNodes(canvas: CanvasItem, metadataNodes: CanvasMetadata['nodes']): Set<string> {
    const changedNodeIds = new Set<string>()

    for (const metadataNode of metadataNodes) {
      const nodeItem = canvas.items.find(
        (item): item is NodeItem => item.kind === 'node' && item.id === metadataNode.id
      )
      if (!nodeItem) {
        continue
      }

      if (this.applyMetadataToNode(nodeItem, metadataNode)) {
        changedNodeIds.add(nodeItem.id)
      }
    }

    return changedNodeIds
  }

  private applyMetadataToNode(nodeItem: NodeItem, metadataNode: CanvasMetadata['nodes'][number]): boolean {
    let changed = false
    if (
      nodeItem.xynode.position.x !== metadataNode.xynode.position.x ||
      nodeItem.xynode.position.y !== metadataNode.xynode.position.y
    ) {
      nodeItem.xynode.position = metadataNode.xynode.position
      changed = true
    }

    if ('collapsed' in metadataNode && nodeItem.collapsed !== metadataNode.collapsed) {
      nodeItem.collapsed = metadataNode.collapsed
      changed = true
    }

    if ('summary' in metadataNode && nodeItem.summary !== metadataNode.summary) {
      nodeItem.summary = metadataNode.summary
      changed = true
    }

    if ('emoji' in metadataNode && nodeItem.emoji !== metadataNode.emoji) {
      nodeItem.emoji = metadataNode.emoji
      changed = true
    }

    if (this.getNodeSectionId(nodeItem) !== metadataNode.sectionId) {
      this.setNodeSectionId(nodeItem, metadataNode.sectionId)
      changed = true
    }

    return changed
  }

  private touchMetadataAuditTargets(canvas: CanvasItem, changedNodeIds: Set<string>, canvasChanged: boolean): void {
    if (!this.auditActor) {
      return
    }

    const now = this.now()

    for (const nodeId of changedNodeIds) {
      const nodeItem = canvas.items.find((item): item is NodeItem => item.kind === 'node' && item.id === nodeId)
      if (!nodeItem) {
        continue
      }

      const previousAudit = nodeItem.xynode.data?.audit
      touchAuditIfNodeUpdated(nodeItem, this.auditActor, now)
      if (previousAudit) {
        nodeItem.xynode.data.audit = mergeAuditFields(previousAudit, nodeItem.xynode.data.audit)
      }
    }

    if (canvasChanged || changedNodeIds.size > 0) {
      touchAuditIfCanvasUpdated(canvas, this.auditActor, now)
    }
  }

  private parseAndValidateMetadata(content: string): CanvasMetadata {
    const parsed = this.parseMetadataYaml(content)
    const normalized = this.stripAuditFieldsFromMetadata(sanitizeCanvasMetadata(parsed))
    this.validateMetadataShape(normalized)

    return normalized as unknown as CanvasMetadata
  }

  private parseMetadataYaml(content: string): Record<string, unknown> {
    let parsed: unknown

    try {
      parsed = yaml.parse(content)
    } catch {
      throw new Error('Invalid YAML in metadata file')
    }

    if (!isObjectRecord(parsed)) {
      throw new Error('Invalid metadata.yaml structure: expected object')
    }

    return parsed
  }

  private stripAuditFieldsFromMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    if (!isObjectRecord(metadata.xynode)) {
      throw new Error('Invalid metadata.yaml structure: xynode must be an object')
    }

    const xynode = metadata.xynode as Record<string, unknown>
    const normalizedXynodeData = isObjectRecord(xynode.data)
      ? Object.fromEntries(Object.entries(xynode.data).filter(([key]) => key !== 'audit'))
      : undefined

    const normalizedNodes = Array.isArray(metadata.nodes)
      ? metadata.nodes.map((node) => {
          if (!isObjectRecord(node) || !isObjectRecord(node.xynode)) {
            return node
          }

          const nodeXynode = node.xynode as Record<string, unknown>
          const normalizedNodeData = isObjectRecord(nodeXynode.data)
            ? Object.fromEntries(Object.entries(nodeXynode.data).filter(([key]) => key !== 'audit'))
            : nodeXynode.data

          return {
            ...node,
            xynode: {
              ...nodeXynode,
              ...(normalizedNodeData !== undefined ? { data: normalizedNodeData } : {}),
            },
          }
        })
      : metadata.nodes

    return {
      ...metadata,
      xynode: {
        ...xynode,
        ...(normalizedXynodeData !== undefined ? { data: normalizedXynodeData } : {}),
      },
      nodes: normalizedNodes,
    }
  }

  private validateMetadataShape(normalized: Record<string, unknown>): void {
    if (typeof normalized.id !== 'string') {
      throw new Error('Invalid metadata.yaml structure: id must be a string')
    }
    if (typeof normalized.name !== 'string') {
      throw new Error('Invalid metadata.yaml structure: name must be a string')
    }

    const normalizedXynode = normalized.xynode as Record<string, unknown>
    if (!isObjectRecord(normalizedXynode.position)) {
      throw new Error('Invalid metadata.yaml structure: xynode.position must be an object')
    }

    const position = normalizedXynode.position as Record<string, unknown>
    if (typeof position.x !== 'number' || typeof position.y !== 'number') {
      throw new Error('Invalid metadata.yaml structure: xynode.position must contain numeric x/y')
    }

    if (!Array.isArray(normalized.edges)) {
      throw new Error('Invalid metadata.yaml structure: edges must be an array')
    }

    for (const edge of normalized.edges) {
      if (!isObjectRecord(edge)) {
        throw new Error('Invalid metadata.yaml structure: edge entries must be objects')
      }
      if (typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
        throw new Error('Invalid metadata.yaml structure: edge entries must include string id/source/target')
      }
    }

    if (!Array.isArray(normalized.nodes)) {
      throw new Error('Invalid metadata.yaml structure: nodes must be an array')
    }

    for (const node of normalized.nodes) {
      if (!isObjectRecord(node)) {
        throw new Error('Invalid metadata.yaml structure: node entries must be objects')
      }
      if (typeof node.id !== 'string' || typeof node.name !== 'string') {
        throw new Error('Invalid metadata.yaml structure: node entries must include string id/name')
      }

      if (!isObjectRecord(node.xynode)) {
        throw new Error('Invalid metadata.yaml structure: node xynode must be an object')
      }

      const nodeXynode = node.xynode as Record<string, unknown>
      if (!isObjectRecord(nodeXynode.position)) {
        throw new Error('Invalid metadata.yaml structure: node xynode.position must be an object')
      }

      const nodePosition = nodeXynode.position as Record<string, unknown>
      if (typeof nodePosition.x !== 'number' || typeof nodePosition.y !== 'number') {
        throw new Error('Invalid metadata.yaml structure: node xynode.position must contain numeric x/y')
      }

      if (node.sectionId !== undefined && typeof node.sectionId !== 'string') {
        throw new Error('Invalid metadata.yaml structure: node sectionId must be a string')
      }
    }

    // Groups are optional — validate shape if present
    if (normalized.groups !== undefined) {
      if (!Array.isArray(normalized.groups)) {
        throw new Error('Invalid metadata.yaml structure: groups must be an array')
      }
      for (const group of normalized.groups) {
        if (!isObjectRecord(group)) {
          throw new Error('Invalid metadata.yaml structure: group entries must be objects')
        }
        if (typeof group.id !== 'string' || typeof group.name !== 'string') {
          throw new Error('Invalid metadata.yaml structure: group entries must include string id/name')
        }
        if (!Array.isArray(group.memberIds)) {
          throw new Error('Invalid metadata.yaml structure: group memberIds must be an array')
        }
      }
    }

    if (normalized.sections !== undefined) {
      if (!Array.isArray(normalized.sections)) {
        throw new Error('Invalid metadata.yaml structure: sections must be an array')
      }
      for (const section of normalized.sections) {
        if (!isObjectRecord(section)) {
          throw new Error('Invalid metadata.yaml structure: section entries must be objects')
        }
        if (typeof section.id !== 'string' || typeof section.title !== 'string') {
          throw new Error('Invalid metadata.yaml structure: section entries must include string id/title')
        }
        if (section.layout !== 'horizontal' && section.layout !== 'grid') {
          throw new Error('Invalid metadata.yaml structure: section layout must be horizontal or grid')
        }
        if (!isObjectRecord(section.position)) {
          throw new Error('Invalid metadata.yaml structure: section position must be an object')
        }
        const sectionPosition = section.position as Record<string, unknown>
        if (typeof sectionPosition.x !== 'number' || typeof sectionPosition.y !== 'number') {
          throw new Error('Invalid metadata.yaml structure: section position must contain numeric x/y')
        }
        if (!Array.isArray(section.memberIds)) {
          throw new Error('Invalid metadata.yaml structure: section memberIds must be an array')
        }
        if (section.pendingPlacement !== undefined) {
          if (!isObjectRecord(section.pendingPlacement)) {
            throw new Error('Invalid metadata.yaml structure: section pendingPlacement must be an object')
          }
          const pendingPlacement = section.pendingPlacement as Record<string, unknown>
          if (pendingPlacement.mode !== 'after' && pendingPlacement.mode !== 'below') {
            throw new Error('Invalid metadata.yaml structure: section pendingPlacement.mode must be after or below')
          }
          if (typeof pendingPlacement.anchorSectionTitle !== 'string') {
            throw new Error(
              'Invalid metadata.yaml structure: section pendingPlacement.anchorSectionTitle must be a string'
            )
          }
          if (
            pendingPlacement.gap !== undefined &&
            (typeof pendingPlacement.gap !== 'number' ||
              !Number.isFinite(pendingPlacement.gap) ||
              pendingPlacement.gap < 0)
          ) {
            throw new Error(
              'Invalid metadata.yaml structure: section pendingPlacement.gap must be a non-negative number'
            )
          }
        }
      }
    }
  }

  /**
   * Find a canvas by its ID, starting from root and searching recursively through items.
   */
  private findCanvasById(canvasId: string): CanvasItem | undefined {
    const root = this.proxy.root
    if (!root) return undefined

    // Check if it's the root canvas
    if (root.id === canvasId) {
      return root
    }

    // Search recursively through items
    const search = (canvas: CanvasItem): CanvasItem | undefined => {
      for (const item of canvas.items) {
        if (item.kind === 'canvas') {
          if (item.id === canvasId) {
            return item
          }
          const found = search(item)
          if (found) return found
        }
      }
      return undefined
    }

    return search(root)
  }

  /**
   * Remove a canvas from the tree by its ID.
   * Returns the removed canvas and parent canvas, or undefined if not found.
   */
  private removeCanvasFromTree(canvasId: string): { removed: CanvasItem; parent: CanvasItem } | undefined {
    const root = this.proxy.root
    if (!root) return undefined

    // Cannot remove root canvas
    if (root.id === canvasId) {
      return undefined
    }

    // Search recursively through items
    const removeFrom = (canvas: CanvasItem): { removed: CanvasItem; parent: CanvasItem } | undefined => {
      for (let i = 0; i < canvas.items.length; i++) {
        const item = canvas.items[i]
        if (item.kind === 'canvas') {
          if (item.id === canvasId) {
            canvas.items.splice(i, 1)
            return { removed: item, parent: canvas }
          }
          const found = removeFrom(item)
          if (found) return found
        }
      }
      return undefined
    }

    return removeFrom(root)
  }
}
