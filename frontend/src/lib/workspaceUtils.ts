import { PathMapper } from 'shared/path-mapper'
import type { CanvasItem, CanvasMapping, NodeItem, PathMapping } from 'shared/path-mapper'
import { sanitizeFilename } from 'shared/constants'
import { parseWorkspaceHref } from 'shared/workspace-interlink'
import type { BlockNoteNodeData } from 'shared'

const METADATA_FILENAME = 'metadata.yaml'
export const KANWAS_SYSTEM_NODE_KIND = 'kanwas_md' as const
const RESERVED_TOP_LEVEL_CANVAS_NAMES = new Set(['projects', 'brain'])

export interface LocatedNode {
  node: NodeItem
  canvasId: string
}

/**
 * Result of resolving a workspace path to an item.
 */
export interface ResolvedPath {
  nodeId: string
  canvasId: string
}

export type ResolvedWorkspaceLink =
  | { type: 'external' }
  | { type: 'node'; nodeId: string; canvasId: string }
  | { type: 'canvas'; canvasId: string }
  | { type: 'unsupported'; reason: 'metadata' }
  | { type: 'unresolved' }

type ResolvedWorkspaceTarget = { type: 'node'; nodeId: string; canvasId: string } | { type: 'canvas'; canvasId: string }

interface OriginalPathIndexes {
  nodeByOriginalPath: Map<string, PathMapping | null>
  canvasByOriginalPath: Map<string, CanvasMapping | null>
}

function buildPathMapper(root: CanvasItem): PathMapper {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace({ root })
  return pathMapper
}

function extractWorkspaceCanonicalPath(href: string): string | null {
  // Reuse shared parsing so navigation, token rendering, and markdown conversion
  // all agree on what counts as a valid workspace href.
  const parsed = parseWorkspaceHref(href)
  return parsed?.canonicalPath ?? null
}

function isMetadataPath(relativePath: string): boolean {
  return relativePath === METADATA_FILENAME || relativePath.endsWith(`/${METADATA_FILENAME}`)
}

function sanitizeCanonicalWorkspacePath(canonicalPath: string): string {
  if (canonicalPath.length === 0) {
    return canonicalPath
  }

  return canonicalPath
    .split('/')
    .map((segment) => (segment.length > 0 ? sanitizeFilename(segment) : segment))
    .join('/')
}

function getPathDepth(path: string): number {
  if (path.length === 0) {
    return 0
  }

  return path.split('/').length
}

function getNodePathExtension(path: string): string {
  const basename = path.split('/').pop() ?? ''
  if (basename.endsWith('.url.yaml')) {
    return '.url.yaml'
  }

  const lastDotIndex = basename.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return ''
  }

  return basename.slice(lastDotIndex)
}

function setUniqueIndexValue<T>(index: Map<string, T | null>, key: string, value: T): void {
  const existing = index.get(key)
  if (existing === undefined) {
    index.set(key, value)
    return
  }

  if (existing !== null) {
    index.set(key, null)
  }
}

function buildOriginalCanvasPathByPath(canvases: CanvasMapping[]): Map<string, string> {
  const originalCanvasPathByPath = new Map<string, string>()
  const sortedCanvases = [...canvases].sort((a, b) => getPathDepth(a.path) - getPathDepth(b.path))

  for (const canvasMapping of sortedCanvases) {
    if (canvasMapping.path.length === 0) {
      originalCanvasPathByPath.set(canvasMapping.path, '')
      continue
    }

    const lastSlashIndex = canvasMapping.path.lastIndexOf('/')
    const parentPath = lastSlashIndex === -1 ? '' : canvasMapping.path.slice(0, lastSlashIndex)
    const parentOriginalPath = originalCanvasPathByPath.get(parentPath)
    if (parentOriginalPath === undefined) {
      continue
    }

    const originalPath =
      parentOriginalPath.length > 0 ? `${parentOriginalPath}/${canvasMapping.originalName}` : canvasMapping.originalName
    originalCanvasPathByPath.set(canvasMapping.path, originalPath)
  }

  return originalCanvasPathByPath
}

function buildOriginalPathIndexes(pathMapper: PathMapper): OriginalPathIndexes {
  const { nodes, canvases } = pathMapper.getAllMappings()
  const canvasPathById = new Map(canvases.map((canvasMapping) => [canvasMapping.canvasId, canvasMapping.path]))
  const originalCanvasPathByPath = buildOriginalCanvasPathByPath(canvases)

  const canvasByOriginalPath = new Map<string, CanvasMapping | null>()
  for (const canvasMapping of canvases) {
    const originalCanvasPath = originalCanvasPathByPath.get(canvasMapping.path)
    if (originalCanvasPath === undefined) {
      continue
    }

    setUniqueIndexValue(canvasByOriginalPath, originalCanvasPath, canvasMapping)
  }

  const nodeByOriginalPath = new Map<string, PathMapping | null>()
  for (const nodeMapping of nodes) {
    const canvasPath = canvasPathById.get(nodeMapping.canvasId)
    if (canvasPath === undefined) {
      continue
    }

    const originalCanvasPath = originalCanvasPathByPath.get(canvasPath)
    if (originalCanvasPath === undefined) {
      continue
    }

    const extension = getNodePathExtension(nodeMapping.path)
    const originalNodePath =
      originalCanvasPath.length > 0
        ? `${originalCanvasPath}/${nodeMapping.originalName}${extension}`
        : `${nodeMapping.originalName}${extension}`

    setUniqueIndexValue(nodeByOriginalPath, originalNodePath, nodeMapping)
  }

  return {
    nodeByOriginalPath,
    canvasByOriginalPath,
  }
}

function toNodeTarget(nodeMapping: PathMapping): ResolvedWorkspaceTarget {
  return {
    type: 'node',
    nodeId: nodeMapping.nodeId,
    canvasId: nodeMapping.canvasId,
  }
}

function toCanvasTarget(canvasMapping: CanvasMapping): ResolvedWorkspaceTarget {
  return {
    type: 'canvas',
    canvasId: canvasMapping.canvasId,
  }
}

function resolveCanonicalTarget(pathMapper: PathMapper, canonicalPath: string): ResolvedWorkspaceTarget | null {
  const nodeMapping = pathMapper.getMapping(canonicalPath)
  if (nodeMapping) {
    return toNodeTarget(nodeMapping)
  }

  const canvasMapping = pathMapper.getCanvasMapping(canonicalPath)
  if (canvasMapping) {
    return toCanvasTarget(canvasMapping)
  }

  return null
}

function resolveUnsanitizedCanonicalPath(
  pathMapper: PathMapper,
  canonicalPath: string
): ResolvedWorkspaceTarget | null {
  const { nodeByOriginalPath, canvasByOriginalPath } = buildOriginalPathIndexes(pathMapper)
  const matchedNode = nodeByOriginalPath.get(canonicalPath)

  if (matchedNode === null) {
    return null
  }

  if (matchedNode) {
    return toNodeTarget(matchedNode)
  }

  const matchedCanvas = canvasByOriginalPath.get(canonicalPath)
  if (matchedCanvas === null) {
    return null
  }

  if (matchedCanvas) {
    return toCanvasTarget(matchedCanvas)
  }

  return null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getBlockNoteData(node: NodeItem): BlockNoteNodeData {
  if (node.xynode.type !== 'blockNote') {
    return {}
  }

  if (!isObjectRecord(node.xynode.data)) {
    return {}
  }

  return node.xynode.data as BlockNoteNodeData
}

export function isKanwasSystemNodeData(data: unknown): data is BlockNoteNodeData {
  if (!isObjectRecord(data)) {
    return false
  }

  return data.systemNodeKind === KANWAS_SYSTEM_NODE_KIND
}

export function isKanwasSystemNode(node: NodeItem): boolean {
  if (node.xynode.type !== 'blockNote') {
    return false
  }

  return isKanwasSystemNodeData(getBlockNoteData(node))
}

export function isKanwasExplicitlyEdited(node: NodeItem): boolean {
  if (!isKanwasSystemNode(node)) {
    return false
  }

  const data = getBlockNoteData(node)
  return data.explicitlyEdited === true
}

export function markKanwasNodeAsExplicitlyEdited(root: CanvasItem, nodeId: string): boolean {
  const locatedNode = findNodeById(root, nodeId)
  if (!locatedNode || locatedNode.node.xynode.type !== 'blockNote') {
    return false
  }

  const currentData = getBlockNoteData(locatedNode.node)
  if (currentData.explicitlyEdited === true && currentData.systemNodeKind === KANWAS_SYSTEM_NODE_KIND) {
    return false
  }

  locatedNode.node.xynode.data = {
    ...currentData,
    systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
    explicitlyEdited: true,
  }

  return true
}

function findFirstKanwasMarker(canvas: CanvasItem): LocatedNode | null {
  for (const item of canvas.items) {
    if (item.kind === 'node' && isKanwasSystemNode(item)) {
      return { node: item, canvasId: canvas.id }
    }

    if (item.kind === 'canvas') {
      const nested = findFirstKanwasMarker(item)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

export function findCanonicalKanwasNode(root: CanvasItem): LocatedNode | null {
  return findFirstKanwasMarker(root)
}

export function findCanonicalKanwasNodeId(root: CanvasItem): string | null {
  return findCanonicalKanwasNode(root)?.node.id ?? null
}

export function isCanonicalKanwasNode(root: CanvasItem, node: NodeItem): boolean {
  const canonicalNodeId = findCanonicalKanwasNodeId(root)
  return canonicalNodeId !== null && canonicalNodeId === node.id
}

export function canvasContainsNodeId(canvas: CanvasItem, nodeId: string): boolean {
  for (const item of canvas.items) {
    if (item.kind === 'node' && item.id === nodeId) {
      return true
    }

    if (item.kind === 'canvas' && canvasContainsNodeId(item, nodeId)) {
      return true
    }
  }

  return false
}

export function canvasContainsCanonicalKanwasNode(root: CanvasItem, canvas: CanvasItem): boolean {
  const canonicalNodeId = findCanonicalKanwasNodeId(root)
  if (!canonicalNodeId) {
    return false
  }

  return canvasContainsNodeId(canvas, canonicalNodeId)
}

export function isReservedTopLevelCanvasName(name: string): boolean {
  return RESERVED_TOP_LEVEL_CANVAS_NAMES.has(name.trim().toLowerCase())
}

export function isReservedTopLevelCanvas(root: CanvasItem, canvas: CanvasItem): boolean {
  return root.items.some(
    (item) => item.kind === 'canvas' && item.id === canvas.id && isReservedTopLevelCanvasName(item.name)
  )
}

export function findNodeById(root: CanvasItem, nodeId: string): LocatedNode | null {
  for (const item of root.items) {
    if (item.kind === 'node' && item.id === nodeId) {
      return {
        node: item,
        canvasId: root.id,
      }
    }

    if (item.kind === 'canvas') {
      const found = findNodeById(item, nodeId)
      if (found) {
        return found
      }
    }
  }

  return null
}

export function canvasContainsKanwasSystemNode(canvas: CanvasItem): boolean {
  return findFirstKanwasMarker(canvas) !== null
}

/**
 * Resolve a link href to a workspace target.
 */
export function resolveWorkspaceLink(root: CanvasItem, href: string): ResolvedWorkspaceLink {
  const canonicalPath = extractWorkspaceCanonicalPath(href)
  if (canonicalPath === null) {
    return { type: 'external' }
  }

  if (isMetadataPath(canonicalPath)) {
    return { type: 'unsupported', reason: 'metadata' }
  }

  const pathMapper = buildPathMapper(root)
  const directTarget = resolveCanonicalTarget(pathMapper, canonicalPath)
  if (directTarget) {
    return directTarget
  }

  const sanitizedCanonicalPath = sanitizeCanonicalWorkspacePath(canonicalPath)
  if (sanitizedCanonicalPath !== canonicalPath) {
    const unsanitizedResolved = resolveUnsanitizedCanonicalPath(pathMapper, canonicalPath)
    if (unsanitizedResolved) {
      return unsanitizedResolved
    }
  }

  return { type: 'unresolved' }
}

/**
 * Resolve a workspace path (like /workspace/canvas/node.md) to nodeId and canvasId.
 * Returns null if the path cannot be resolved.
 */
export function resolveWorkspacePath(root: CanvasItem, path: string): ResolvedPath | null {
  const resolved = resolveWorkspaceLink(root, path)
  if (resolved.type !== 'node') {
    return null
  }

  return {
    nodeId: resolved.nodeId,
    canvasId: resolved.canvasId,
  }
}

/**
 * Resolve a canvas path (like /workspace/canvas/) to canvasId.
 * Returns null if the path cannot be resolved.
 */
export function resolveCanvasPath(root: CanvasItem, path: string): string | null {
  const resolved = resolveWorkspaceLink(root, path)
  if (resolved.type !== 'canvas') {
    return null
  }

  return resolved.canvasId
}

export function getCanonicalCanvasPath(root: CanvasItem, canvasId: string): string | null {
  const pathMapper = buildPathMapper(root)
  const path = pathMapper.getPathForCanvas(canvasId)
  return typeof path === 'string' ? path : null
}

/**
 * Find a canvas by ID in the workspace tree.
 * Starts from root and searches through items recursively.
 */
export function findCanvasById(root: CanvasItem, canvasId: string): CanvasItem | null {
  // Check if root is the target
  if (root.id === canvasId) {
    return root
  }

  // Search child canvases recursively
  for (const item of root.items) {
    if (item.kind === 'canvas') {
      const found = findCanvasById(item, canvasId)
      if (found) return found
    }
  }

  return null
}

/**
 * Get the default canvas for the workspace.
 * Returns root itself as the default view.
 */
export function findFirstCanvas(root: CanvasItem): CanvasItem {
  return root
}

/**
 * Find a canvas by its path (e.g., "Canvas" or "Canvas/Subcanvas").
 * Traverses the tree following the path segments.
 */
export function findCanvasByPath(root: CanvasItem, path: string): CanvasItem | null {
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) {
    return root
  }

  let current: CanvasItem = root
  for (const segment of segments) {
    const found = current.items.find((item) => item.kind === 'canvas' && item.name === segment) as
      | CanvasItem
      | undefined
    if (!found) {
      return null
    }
    current = found
  }

  return current
}
