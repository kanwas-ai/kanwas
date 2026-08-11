import * as Y from 'yjs'
import * as yaml from 'yaml'
import type {
  AuditFields,
  WorkspaceDocument,
  CanvasItem,
  NodeItem,
  XyNode,
  BlockNoteNode,
  ImageNode,
  FileNode,
  AudioNode,
  LinkNode,
  TextNode,
  StickyNoteNode,
  CanvasMetadata,
} from '../types.js'
import { sanitizeFilename } from '../constants.js'
import { makeUniqueName } from './path-mapper.js'
import { createWorkspaceContentStore, type WorkspaceContentStore } from './workspace-content-store.js'
import { type Logger, noopLogger } from '../logging/types.js'
import { getNodeFilesystemExtension } from './filesystem-paths.js'
import { createServerBlockNoteEditor } from './server-blocknote.js'
import { fragmentToWorkspaceMarkdown } from './blocknote-conversion.js'
import { collectAuditActors, resolveAuditIdentities, toMetadataAuditFields, type AuditIdentity } from './audit.js'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ============================================================================
// FILESYSTEM NODE STRUCTURE
// ============================================================================

export interface FSNode {
  type: 'folder' | 'file'
  name: string
  children?: FSNode[] // Only for folders
  data?: Buffer // Only for files
}

// ============================================================================
// BINARY FILE SUPPORT
// ============================================================================

/**
 * Generic file fetcher - works for images, PDFs, and any binary file type.
 * Returns the binary content as a Buffer.
 */
export type FileFetcher = (storagePath: string) => Promise<Buffer>

/**
 * Options for workspace to filesystem conversion.
 */
export interface ConverterOptions {
  /**
   * Optional file fetcher for binary files (images, PDFs, etc.)
   * If not provided, binary nodes will be written as placeholder markdown files.
   */
  fileFetcher?: FileFetcher
  /**
   * Optional logger for conversion logging.
   */
  logger?: Logger
  /**
   * Optional actor identity resolver used when serializing metadata audit fields.
   */
  resolveActorIdentity?: (actor: string) => Promise<AuditIdentity | null>
}

function getAuditFieldsFromData(data: unknown): AuditFields | undefined {
  if (!data || typeof data !== 'object') return undefined
  const audit = (data as Record<string, unknown>).audit
  if (!audit || typeof audit !== 'object') return undefined
  return audit as AuditFields
}

function cloneNodeForMetadata(
  node: XyNode,
  resolved: Map<string, AuditIdentity | null>
): CanvasMetadata['nodes'][number]['xynode'] {
  const nodeData = isObjectRecord(node.data) ? node.data : {}
  const metadataNodeData = Object.fromEntries(
    Object.entries(nodeData).filter(([key]) => key !== 'pendingCanvasPlacement')
  )
  const audit = toMetadataAuditFields(getAuditFieldsFromData(nodeData), resolved)

  return {
    id: node.id,
    type: node.type,
    position: { ...node.position },
    ...(node.measured ? { measured: { ...node.measured } } : {}),
    data: audit
      ? {
          ...metadataNodeData,
          audit,
        }
      : { ...metadataNodeData },
    ...(typeof node.width === 'number' ? { width: node.width } : {}),
    ...(typeof node.height === 'number' ? { height: node.height } : {}),
  }
}

/**
 * Check if a MIME type is text-based and should have trailing newline normalized.
 */
export function isTextBasedMimeType(mimeType: string): boolean {
  const textBasedTypes = [
    'text/csv',
    'text/tab-separated-values',
    'text/plain',
    'application/json',
    'application/xml',
    'text/xml',
    'application/x-yaml',
    'text/yaml',
  ]
  return textBasedTypes.includes(mimeType)
}

/**
 * Ensure buffer ends with newline for text-based content.
 */
export function ensureTrailingNewline(buffer: Buffer): Buffer {
  if (buffer.length === 0) return buffer
  if (buffer[buffer.length - 1] === 0x0a) return buffer // Already ends with \n
  return Buffer.concat([buffer, Buffer.from('\n')])
}

// ============================================================================
// NODE PARSERS
// ============================================================================

async function parseBlockNoteNode(xynode: BlockNoteNode, contentStore: WorkspaceContentStore): Promise<Buffer> {
  const xmlFragment = contentStore.getBlockNoteFragment(xynode.id)

  if (!xmlFragment) {
    // Fallback to empty content if no editor data found
    return Buffer.from(`# ${xynode.id}\n\n(No content)\n`)
  }

  // Check if fragment is empty - BlockNote can't parse empty fragments
  if (xmlFragment.length === 0) {
    return Buffer.from(`# ${xynode.id}\n\n(Empty content)\n`)
  }

  try {
    // Create editor and load the XML fragment
    const editor = createServerBlockNoteEditor()
    const markdown = await fragmentToWorkspaceMarkdown(editor, xmlFragment)
    return Buffer.from(markdown)
  } catch (error) {
    // Handle BlockNote parsing errors gracefully
    const message = error instanceof Error ? error.message : String(error)
    return Buffer.from(`# ${xynode.id}\n\n(Error reading content: ${message})\n`)
  }
}

/**
 * Parse a binary node (image, PDF, etc.) to its actual binary content.
 * Falls back to a placeholder if no fetcher is provided.
 */
async function parseBinaryNode(
  storagePath: string,
  nodeId: string,
  fileFetcher?: FileFetcher,
  log?: Logger
): Promise<Buffer> {
  if (!fileFetcher) {
    // Fallback for contexts without fetcher (tests, backend-only)
    return Buffer.from(`# Binary file: ${nodeId}\n\nStorage path: ${storagePath}\n`)
  }

  try {
    return await fileFetcher(storagePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const logger = log ?? noopLogger
    logger.error({ storagePath, nodeId, error: message }, 'Failed to fetch binary file')
    return Buffer.from(`# Binary file: ${nodeId}\n\nError loading file: ${message}\n`)
  }
}

async function parseImageNode(xynode: ImageNode, fileFetcher?: FileFetcher, log?: Logger): Promise<Buffer> {
  return parseBinaryNode(xynode.data.storagePath, xynode.id, fileFetcher, log)
}

async function parseFileNode(xynode: FileNode, fileFetcher?: FileFetcher, log?: Logger): Promise<Buffer> {
  const buffer = await parseBinaryNode(xynode.data.storagePath, xynode.id, fileFetcher, log)

  // Ensure text-based files end with newline (prevents cat >> concatenation issues)
  if (isTextBasedMimeType(xynode.data.mimeType)) {
    return ensureTrailingNewline(buffer)
  }

  return buffer
}

async function parseAudioNode(xynode: AudioNode, fileFetcher?: FileFetcher, log?: Logger): Promise<Buffer> {
  return parseBinaryNode(xynode.data.storagePath, xynode.id, fileFetcher, log)
}

function parseLinkNode(xynode: LinkNode): Buffer {
  const data = xynode.data

  // Build YAML object with only defined fields
  const yamlObj: Record<string, unknown> = {
    url: data.url,
  }

  // Add metadata if available
  if (data.title) yamlObj.title = data.title
  if (data.description) yamlObj.description = data.description
  if (data.siteName) yamlObj.siteName = data.siteName
  if (data.imageStoragePath) yamlObj.imageStoragePath = data.imageStoragePath
  yamlObj.displayMode = data.displayMode ?? 'preview'

  return Buffer.from(yaml.stringify(yamlObj))
}

function parseTextNode(xynode: TextNode): Buffer {
  const data = xynode.data
  const yamlObj: Record<string, unknown> = { content: data.content }
  if (data.fontSize !== undefined) yamlObj.fontSize = data.fontSize
  if (data.fontFamily) yamlObj.fontFamily = data.fontFamily
  if (data.color) yamlObj.color = data.color
  return Buffer.from(yaml.stringify(yamlObj))
}

async function parseStickyNoteNode(xynode: StickyNoteNode, contentStore: WorkspaceContentStore): Promise<Buffer> {
  const data = xynode.data
  const yamlObj: Record<string, unknown> = {}
  const xmlFragment = contentStore.getBlockNoteFragment(xynode.id)

  if (!xmlFragment) {
    throw new Error(`Sticky note ${xynode.id} is missing attached note content`)
  }

  if (xmlFragment.length === 0) {
    yamlObj.content = ''
  } else {
    const editor = createServerBlockNoteEditor()
    yamlObj.content = await fragmentToWorkspaceMarkdown(editor, xmlFragment)
  }

  if (data.color) yamlObj.color = data.color
  if (data.fontFamily) yamlObj.fontFamily = data.fontFamily
  return Buffer.from(yaml.stringify(yamlObj))
}

async function parseNodeContent(
  xynode: XyNode,
  contentStore: WorkspaceContentStore,
  fileFetcher?: FileFetcher,
  log?: Logger
): Promise<Buffer> {
  switch (xynode.type) {
    case 'blockNote':
      return await parseBlockNoteNode(xynode as BlockNoteNode, contentStore)
    case 'image':
      return parseImageNode(xynode as ImageNode, fileFetcher, log)
    case 'file':
      return parseFileNode(xynode as FileNode, fileFetcher, log)
    case 'audio':
      return parseAudioNode(xynode as AudioNode, fileFetcher, log)
    case 'link':
      return parseLinkNode(xynode as LinkNode)
    case 'text':
      return parseTextNode(xynode as TextNode)
    case 'stickyNote':
      return await parseStickyNoteNode(xynode as StickyNoteNode, contentStore)
    case 'canvas':
      // Canvas nodes don't have content - they are rendered as folders
      return Buffer.from('# Canvas\n\n(This is a canvas node)\n')
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = xynode
      void _exhaustive
      return Buffer.from('# Unknown node type\n')
    }
  }
}

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert a canvas to an FSNode folder.
 * Handles both nodes (content files) and child canvases (subdirectories).
 */
async function convertCanvasToFSNode(
  canvas: CanvasItem,
  contentStore: WorkspaceContentStore,
  usedNames: Set<string>,
  isRoot: boolean = false,
  options?: ConverterOptions,
  log?: Logger
): Promise<FSNode> {
  const children: FSNode[] = []

  // Filter items by kind
  const nodeItems = canvas.items.filter((item): item is NodeItem => item.kind === 'node')
  const canvasItems = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')

  const actorKeys = new Set<string>()
  collectAuditActors(getAuditFieldsFromData(canvas.xynode.data), actorKeys)
  for (const nodeItem of nodeItems) {
    collectAuditActors(getAuditFieldsFromData(nodeItem.xynode.data), actorKeys)
  }

  const resolvedActors = await resolveAuditIdentities(actorKeys, options?.resolveActorIdentity)
  const canvasAudit = toMetadataAuditFields(getAuditFieldsFromData(canvas.xynode.data), resolvedActors)

  // Create metadata.yaml with canvas info and all node xynodes
  const metadata: CanvasMetadata = {
    id: canvas.id,
    name: canvas.name,
    xynode: {
      position: { ...canvas.xynode.position },
      ...(canvas.xynode.measured ? { measured: { ...canvas.xynode.measured } } : {}),
      ...(canvasAudit && { data: { audit: canvasAudit } }),
    },
    edges: canvas.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
    nodes: nodeItems.map((nodeItem) => ({
      id: nodeItem.id,
      name: nodeItem.name,
      xynode: cloneNodeForMetadata(nodeItem.xynode, resolvedActors),
      ...(nodeItem.collapsed !== undefined && { collapsed: nodeItem.collapsed }),
      ...(nodeItem.summary && { summary: nodeItem.summary }),
      ...(nodeItem.emoji && { emoji: nodeItem.emoji }),
      ...(typeof (nodeItem.xynode.data as { sectionId?: string } | undefined)?.sectionId === 'string'
        ? { sectionId: (nodeItem.xynode.data as { sectionId?: string }).sectionId }
        : {}),
    })),
    ...(canvas.groups && canvas.groups.length > 0 && { groups: canvas.groups }),
    ...(canvas.sections && canvas.sections.length > 0 && { sections: canvas.sections }),
  }

  children.push({
    type: 'file',
    name: 'metadata.yaml',
    data: Buffer.from(yaml.stringify(metadata)),
  })

  // Track used names within this canvas for nodes and child canvases
  const usedNamesInCanvas = new Set<string>()

  // Sort nodes by ID for deterministic deduplication order
  const sortedNodes = [...nodeItems].sort((a, b) => a.id.localeCompare(b.id))

  // Create files for each node
  for (const nodeItem of sortedNodes) {
    const sanitizedName = sanitizeFilename(nodeItem.name)
    const extension = getNodeFilesystemExtension(nodeItem)
    const uniqueName = makeUniqueName(sanitizedName, usedNamesInCanvas, extension)
    const filename = `${uniqueName}${extension}`

    children.push({
      type: 'file',
      name: filename,
      data: await parseNodeContent(nodeItem.xynode, contentStore, options?.fileFetcher, log),
    })
  }

  // Sort child canvases by ID for deterministic deduplication order
  const sortedChildren = [...canvasItems].sort((a, b) => a.id.localeCompare(b.id))

  // Recursively convert child canvases
  for (const childCanvas of sortedChildren) {
    const childNode = await convertCanvasToFSNode(childCanvas, contentStore, usedNamesInCanvas, false, options, log)
    children.push(childNode)
  }

  // For root canvas, use "." as name; for child canvases, use sanitized name with deduplication
  const folderName = isRoot ? '.' : makeUniqueName(sanitizeFilename(canvas.name), usedNames)

  return {
    type: 'folder',
    name: folderName,
    children,
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Converts a WorkspaceDocument to a filesystem tree representation
 *
 * @param proxy - The valtio proxy to the WorkspaceDocument
 * @param contentSource - Either the underlying Yjs workspace doc or a content store abstraction
 * @param options - Optional conversion options (e.g., fileFetcher for binary files)
 * @returns FSNode representing the root of the filesystem tree
 *
 * The conversion follows these rules:
 * - Root canvas maps to the workspace directory (".")
 * - Child canvases become subdirectories (no c- prefix)
 * - Block notes become .md files within their parent canvas
 * - Text nodes become .text.yaml files within their parent canvas
 * - Sticky notes become .sticky.yaml files within their parent canvas
 * - Binary nodes (images, etc.) become files with their native extension
 * - Duplicate names get numeric suffixes (-2, -3, etc.)
 * - Items are sorted by ID for deterministic suffix assignment
 * - Each canvas folder contains:
 *   - metadata.yaml: canvas metadata + all node xynodes
 *   - {node-name}.md / .text.yaml / .sticky.yaml: one file per content node
 *   - {node-name}.{ext}: one file per binary node with actual binary data
 *   - subdirectories for child canvases
 */
export async function workspaceToFilesystem(
  proxy: WorkspaceDocument,
  yDoc: Y.Doc,
  options?: ConverterOptions
): Promise<FSNode>
export async function workspaceToFilesystem(
  proxy: WorkspaceDocument,
  contentStore: WorkspaceContentStore,
  options?: ConverterOptions
): Promise<FSNode>
export async function workspaceToFilesystem(
  proxy: WorkspaceDocument,
  contentSource: Y.Doc | WorkspaceContentStore,
  options?: ConverterOptions
): Promise<FSNode> {
  const log = options?.logger?.child({ component: 'WorkspaceConverter' }) ?? noopLogger
  const root = proxy.root
  const contentStore = contentSource instanceof Y.Doc ? createWorkspaceContentStore(contentSource) : contentSource

  if (!root) {
    log.debug('No root canvas found, returning empty workspace')
    // No root canvas - return empty workspace
    return {
      type: 'folder',
      name: '.',
      children: [],
    }
  }

  log.debug({ rootCanvasId: root.id, rootCanvasName: root.name }, 'Starting workspace conversion')

  // Track used names at root level (for the root canvas's contents)
  const usedNames = new Set<string>()

  // Convert root canvas - it becomes the workspace root directory
  const result = await convertCanvasToFSNode(root, contentStore, usedNames, true, options, log)

  log.info({ rootCanvasId: root.id, childCount: result.children?.length ?? 0 }, 'Workspace conversion complete')
  return result
}
