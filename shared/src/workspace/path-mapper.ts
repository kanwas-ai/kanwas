import type { WorkspaceDocument, CanvasItem, NodeItem } from '../types.js'
import { sanitizeFilename } from '../constants.js'
import { type Logger, noopLogger } from '../logging/types.js'
import { getNodeFilesystemExtension } from './filesystem-paths.js'

/**
 * Generate a unique name by adding numeric suffix if needed.
 * Uses case-insensitive comparison for filesystem compatibility.
 *
 * @param baseName - The desired name (already sanitized)
 * @param usedNames - Set of already-used names (will be mutated to add the result)
 * @param extension - Optional extension (e.g., ".md") to append after suffix
 * @returns Unique name with suffix if needed (e.g., "Note", "Note-2", "Note-3")
 */
export function makeUniqueName(baseName: string, usedNames: Set<string>, extension: string = ''): string {
  // Normalize for case-insensitive comparison
  const normalize = (n: string) => n.toLowerCase()

  let candidate = baseName
  let suffix = 1

  // Check if base name (with extension) is already used
  while (usedNames.has(normalize(candidate + extension))) {
    suffix++
    candidate = `${baseName}-${suffix}`
  }

  // Add the result to used names
  usedNames.add(normalize(candidate + extension))

  return candidate
}

/**
 * Mapping information for a filesystem path
 */
export interface PathMapping {
  /** Relative path from workspace root (e.g., "templates/emails/newsletter/Note.md") */
  path: string
  /** Node ID in workspace */
  nodeId: string
  /** Parent canvas ID */
  canvasId: string
  /** Original node name (before sanitization) */
  originalName: string
  /** Type of item */
  type: 'node'
}

/**
 * Mapping information for a canvas directory
 */
export interface CanvasMapping {
  /** Relative path from workspace root (e.g., "templates/emails/newsletter") */
  path: string
  /** Canvas ID in workspace */
  canvasId: string
  /** Original canvas name (before sanitization) */
  originalName: string
}

/**
 * PathMapper maintains bidirectional mapping between filesystem paths and Yjs node/canvas IDs.
 *
 * The mapping is built from the workspace document structure and uses the same
 * filename sanitization logic as the converter.
 */
export class PathMapper {
  private pathToMapping = new Map<string, PathMapping>()
  private nodeIdToPath = new Map<string, string>()
  private canvasIdToPath = new Map<string, string>()
  private pathToCanvas = new Map<string, CanvasMapping>()
  private log: Logger

  constructor(logger?: Logger) {
    this.log = logger?.child({ component: 'PathMapper' }) ?? noopLogger
  }

  /**
   * Build the mapping from a workspace document.
   * This should be called after initial hydration.
   */
  buildFromWorkspace(proxy: WorkspaceDocument): void {
    this.log.debug('Building path mappings from workspace')

    // Clear existing mappings
    this.pathToMapping.clear()
    this.nodeIdToPath.clear()
    this.canvasIdToPath.clear()
    this.pathToCanvas.clear()

    // Start from root canvas
    const root = proxy.root
    if (!root) {
      this.log.debug('No root canvas found')
      return
    }

    // Root canvas has path "" (empty string)
    this.addCanvasMapping({ path: '', canvasId: root.id, originalName: root.name })

    // Track used names at root level for collision detection
    const usedNamesAtRoot = new Set<string>()

    // Process root's items
    this.processCanvasItems(root, '', usedNamesAtRoot)

    this.log.info({ nodeCount: this.pathToMapping.size, canvasCount: this.pathToCanvas.size }, 'Path mappings built')
  }

  private processCanvas(canvas: CanvasItem, parentPath: string, usedNames: Set<string>): void {
    // Canvas directories no longer have "c-" prefix - generate unique name
    const sanitizedName = sanitizeFilename(canvas.name)
    const uniqueName = makeUniqueName(sanitizedName, usedNames)
    const canvasPath = parentPath ? `${parentPath}/${uniqueName}` : uniqueName

    // Store canvas mapping
    const canvasMapping: CanvasMapping = {
      path: canvasPath,
      canvasId: canvas.id,
      originalName: canvas.name,
    }
    this.canvasIdToPath.set(canvas.id, canvasPath)
    this.pathToCanvas.set(canvasPath, canvasMapping)

    // Track used names within this canvas
    const usedNamesInCanvas = new Set<string>()

    // Process items within the canvas
    this.processCanvasItems(canvas, canvasPath, usedNamesInCanvas)
  }

  private processCanvasItems(canvas: CanvasItem, canvasPath: string, usedNames: Set<string>): void {
    // Separate nodes and child canvases
    const nodeItems = canvas.items.filter((item): item is NodeItem => item.kind === 'node')
    const canvasItems = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')

    // Sort nodes by ID for deterministic deduplication order
    const sortedNodes = [...nodeItems].sort((a, b) => a.id.localeCompare(b.id))
    for (const nodeItem of sortedNodes) {
      this.processNode(nodeItem, canvasPath, canvas.id, usedNames)
    }

    // Sort child canvases by ID for deterministic deduplication order
    const sortedChildren = [...canvasItems].sort((a, b) => a.id.localeCompare(b.id))
    for (const child of sortedChildren) {
      this.processCanvas(child, canvasPath, usedNames)
    }
  }

  private processNode(node: NodeItem, canvasPath: string, canvasId: string, usedNames: Set<string>): void {
    const sanitizedName = sanitizeFilename(node.name)
    const extension = getNodeFilesystemExtension(node)

    const uniqueName = makeUniqueName(sanitizedName, usedNames, extension)
    const nodePath = canvasPath ? `${canvasPath}/${uniqueName}${extension}` : `${uniqueName}${extension}`

    const mapping: PathMapping = {
      path: nodePath,
      nodeId: node.id,
      canvasId,
      originalName: node.name,
      type: 'node',
    }

    this.pathToMapping.set(nodePath, mapping)
    this.nodeIdToPath.set(node.id, nodePath)
  }

  /**
   * Get mapping for a filesystem path
   */
  getMapping(relativePath: string): PathMapping | undefined {
    return this.pathToMapping.get(relativePath)
  }

  /**
   * Get filesystem path for a node ID
   */
  getPathForNode(nodeId: string): string | undefined {
    return this.nodeIdToPath.get(nodeId)
  }

  /**
   * Get filesystem path for a canvas ID
   */
  getPathForCanvas(canvasId: string): string | undefined {
    return this.canvasIdToPath.get(canvasId)
  }

  /**
   * Get canvas mapping for a path
   */
  getCanvasMapping(path: string): CanvasMapping | undefined {
    return this.pathToCanvas.get(path)
  }

  /**
   * Check if a path is a canvas directory path (not a file)
   */
  isCanvasPath(relativePath: string): boolean {
    return !relativePath.endsWith('.md') && !relativePath.endsWith('.yaml')
  }

  /**
   * Resolve a file path to its parent canvas.
   * Works for any file extension (md, png, jpg, etc.)
   * Returns the canvas ID and full filename (caller handles extension stripping).
   */
  resolveNewFile(relativePath: string): { canvasId: string; nodeName: string } | undefined {
    const parts = relativePath.split('/')
    const filename = parts[parts.length - 1]

    // Find the parent canvas directory
    const parentPath = parts.slice(0, -1).join('/')

    // Look up the parent canvas
    const canvasMapping = this.pathToCanvas.get(parentPath)
    if (canvasMapping) {
      return {
        canvasId: canvasMapping.canvasId,
        nodeName: filename,
      }
    }

    // If parent is root (empty path), use root canvas
    if (parentPath === '') {
      const rootMapping = this.pathToCanvas.get('')
      if (rootMapping) {
        return {
          canvasId: rootMapping.canvasId,
          nodeName: filename,
        }
      }
    }

    return undefined
  }

  /**
   * Resolve a new canvas directory to its parent canvas path.
   * Returns the parent canvas path and canvas name.
   */
  resolveNewCanvas(relativePath: string): { parentPath: string; canvasName: string } | undefined {
    if (relativePath.endsWith('.md') || relativePath.endsWith('.yaml')) {
      return undefined
    }

    const parts = relativePath.split('/')
    const dirName = parts[parts.length - 1]

    const canvasName = dirName
    const parentPath = parts.slice(0, -1).join('/')

    return { parentPath, canvasName }
  }

  /**
   * Add a new mapping (called when a new node is created)
   */
  addMapping(mapping: PathMapping): void {
    this.pathToMapping.set(mapping.path, mapping)
    this.nodeIdToPath.set(mapping.nodeId, mapping.path)
  }

  /**
   * Replace an existing node mapping when a file is renamed or moved.
   */
  replaceMapping(oldPath: string, mapping: PathMapping): void {
    const existing = this.pathToMapping.get(oldPath)
    if (existing) {
      this.pathToMapping.delete(oldPath)
      if (this.nodeIdToPath.get(existing.nodeId) === oldPath) {
        this.nodeIdToPath.delete(existing.nodeId)
      }
    }

    this.pathToMapping.set(mapping.path, mapping)
    this.nodeIdToPath.set(mapping.nodeId, mapping.path)
  }

  /**
   * Add a new canvas mapping (called when a new canvas is created)
   */
  addCanvasMapping(mapping: CanvasMapping): void {
    this.pathToCanvas.set(mapping.path, mapping)
    this.canvasIdToPath.set(mapping.canvasId, mapping.path)
  }

  /**
   * Replace an existing canvas mapping and rewrite all descendant paths.
   */
  replaceCanvasMapping(oldPath: string, mapping: CanvasMapping): void {
    const existing = this.pathToCanvas.get(oldPath)
    if (existing) {
      this.pathToCanvas.delete(oldPath)
      if (this.canvasIdToPath.get(existing.canvasId) === oldPath) {
        this.canvasIdToPath.delete(existing.canvasId)
      }
    }

    this.pathToCanvas.set(mapping.path, mapping)
    this.canvasIdToPath.set(mapping.canvasId, mapping.path)

    const nodeMappings = Array.from(this.pathToMapping.values())
    for (const nodeMapping of nodeMappings) {
      if (!this.isDescendantPath(nodeMapping.path, oldPath)) {
        continue
      }

      const nextPath = this.rewriteDescendantPath(nodeMapping.path, oldPath, mapping.path)
      this.pathToMapping.delete(nodeMapping.path)
      const nextMapping: PathMapping = { ...nodeMapping, path: nextPath }
      this.pathToMapping.set(nextPath, nextMapping)
      this.nodeIdToPath.set(nextMapping.nodeId, nextPath)
    }

    const canvasMappings = Array.from(this.pathToCanvas.values())
    for (const canvasMapping of canvasMappings) {
      if (canvasMapping.canvasId === mapping.canvasId || !this.isDescendantPath(canvasMapping.path, oldPath)) {
        continue
      }

      const nextPath = this.rewriteDescendantPath(canvasMapping.path, oldPath, mapping.path)
      this.pathToCanvas.delete(canvasMapping.path)
      const nextCanvasMapping: CanvasMapping = { ...canvasMapping, path: nextPath }
      this.pathToCanvas.set(nextPath, nextCanvasMapping)
      this.canvasIdToPath.set(nextCanvasMapping.canvasId, nextPath)
    }
  }

  /**
   * Remove a mapping by path (called when a node is deleted)
   */
  removeByPath(path: string): void {
    const mapping = this.pathToMapping.get(path)
    if (mapping) {
      this.pathToMapping.delete(path)
      this.nodeIdToPath.delete(mapping.nodeId)
    }
  }

  /**
   * Remove a canvas mapping by path (called when a canvas is deleted)
   */
  removeCanvasByPath(path: string): void {
    const mapping = this.pathToCanvas.get(path)
    if (mapping) {
      this.pathToCanvas.delete(path)
      this.canvasIdToPath.delete(mapping.canvasId)
    }
  }

  /**
   * Debug: Get all mappings
   */
  getAllMappings(): { nodes: PathMapping[]; canvases: CanvasMapping[] } {
    return {
      nodes: Array.from(this.pathToMapping.values()),
      canvases: Array.from(this.pathToCanvas.values()),
    }
  }

  private isDescendantPath(path: string, ancestorPath: string): boolean {
    if (ancestorPath.length === 0) {
      return path.length > 0
    }

    return path.startsWith(`${ancestorPath}/`)
  }

  private rewriteDescendantPath(path: string, oldPrefix: string, newPrefix: string): string {
    const suffix = oldPrefix.length === 0 ? path : path.slice(oldPrefix.length + 1)
    return newPrefix.length === 0 ? suffix : `${newPrefix}/${suffix}`
  }
}
