import type { AuditFields, WorkspaceDocument, CanvasItem, NodeItem } from '../types.js'
import { sanitizeFilename } from '../constants.js'
import { PathMapper } from './path-mapper.js'

export interface ActiveCanvasContextOptions {
  now?: Date | string | number
}

export interface WorkspaceInvokeContextOptions extends ActiveCanvasContextOptions {
  canvasId?: string | null
  selectedNodeIds?: string[] | null
  mentionedNodeIds?: string[] | null
}

export interface WorkspaceInvokeContext {
  workspaceTree: string
  canvasPath: string | null
  activeCanvasContext: string | null
  selectedNodePaths: string[] | undefined
  mentionedNodePaths: string[] | undefined
}

interface CanvasNodeInfo {
  node: NodeItem
  path: string
}

interface WorkspaceTreeFormatOptions {
  auditCanvasId?: string | null
  nowMs?: number
}

interface WorkspaceTreeItem {
  type: 'file' | 'canvas'
  name: string
  canvas?: CanvasItem
  includeAudit?: boolean
  audit?: AuditFields
}

/**
 * Generate a Unix tree-style representation of the workspace structure.
 * Output matches the `tree` command format.
 */
export function formatWorkspaceTree(doc: WorkspaceDocument): string {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(doc)
  return formatWorkspaceTreeWithPathMapper(doc, pathMapper)
}

export function formatWorkspaceInvokeContext(
  doc: WorkspaceDocument,
  options: WorkspaceInvokeContextOptions = {}
): WorkspaceInvokeContext {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(doc)
  const nowMs = resolveNowMs(options.now)

  return {
    workspaceTree: formatWorkspaceTreeWithPathMapper(doc, pathMapper, {
      auditCanvasId: options.canvasId,
      nowMs,
    }),
    canvasPath: options.canvasId ? findCanvasPathWithPathMapper(doc, options.canvasId, pathMapper) : null,
    activeCanvasContext: options.canvasId
      ? formatActiveCanvasContextWithPathMapper(doc, options.canvasId, pathMapper)
      : null,
    selectedNodePaths:
      options.selectedNodeIds && options.selectedNodeIds.length > 0
        ? getSelectedNodesInfoWithPathMapper(doc, options.selectedNodeIds, pathMapper).map((node) => node.path)
        : undefined,
    mentionedNodePaths:
      options.mentionedNodeIds && options.mentionedNodeIds.length > 0
        ? getSelectedNodesInfoWithPathMapper(doc, options.mentionedNodeIds, pathMapper).map((node) => node.path)
        : undefined,
  }
}

function formatWorkspaceTreeWithPathMapper(
  doc: WorkspaceDocument,
  pathMapper: PathMapper,
  options: WorkspaceTreeFormatOptions = {}
): string {
  const lines: string[] = ['/workspace']

  const root = doc.root
  if (!root) {
    return lines.join('\n')
  }

  // Root canvas contains items (nodes and child canvases)
  const nodeItems = root.items.filter((item): item is NodeItem => item.kind === 'node')
  const canvasItems = root.items.filter((item): item is CanvasItem => item.kind === 'canvas')

  // Sort by name
  const sortedNodes = [...nodeItems].sort((a, b) => a.name.localeCompare(b.name))
  const sortedChildren = [...canvasItems].sort((a, b) => a.name.localeCompare(b.name))

  // Collect all items at root level: metadata.yaml, node files, and child canvas directories
  const allItems: WorkspaceTreeItem[] = []

  // Add metadata.yaml first
  allItems.push({ type: 'file', name: 'metadata.yaml' })

  // Add node files
  for (const node of sortedNodes) {
    const nodePath = pathMapper.getPathForNode(node.id)
    if (nodePath) {
      allItems.push({
        type: 'file',
        name: nodePath.split('/').pop() ?? nodePath,
        includeAudit: options.auditCanvasId === root.id,
        audit: getNodeAudit(node),
      })
    }
  }

  // Add child canvases
  for (const child of sortedChildren) {
    allItems.push({ type: 'canvas', name: sanitizeFilename(child.name), canvas: child })
  }

  for (let i = 0; i < allItems.length; i++) {
    const isLast = i === allItems.length - 1
    const connector = isLast ? '`-- ' : '|-- '
    const item = allItems[i]

    if (item.type === 'file') {
      lines.push(`${connector}${formatWorkspaceTreeFileName(item, options)}`)
    } else if (item.canvas) {
      formatCanvas(item.canvas, '', isLast, lines, pathMapper, options)
    }
  }

  return lines.join('\n')
}

export function formatActiveCanvasContext(
  doc: WorkspaceDocument,
  canvasId: string | null | undefined,
  options: ActiveCanvasContextOptions = {}
): string | null {
  void options
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(doc)
  return formatActiveCanvasContextWithPathMapper(doc, canvasId, pathMapper)
}

function formatActiveCanvasContextWithPathMapper(
  doc: WorkspaceDocument,
  canvasId: string | null | undefined,
  pathMapper: PathMapper
): string | null {
  const root = doc.root
  if (!root || !canvasId) {
    return null
  }

  const canvas = findCanvasById(root, canvasId)
  if (!canvas) {
    return null
  }

  const canvasPath = pathMapper.getPathForCanvas(canvas.id)
  if (canvasPath === undefined) {
    return null
  }

  const nodeInfos = canvas.items
    .filter((item): item is NodeItem => item.kind === 'node')
    .map((node): CanvasNodeInfo | null => {
      const path = pathMapper.getPathForNode(node.id)
      return path ? { node, path } : null
    })
    .filter((info): info is CanvasNodeInfo => info !== null)
    .sort((a, b) => a.path.localeCompare(b.path))

  const nodeInfoById = new Map(nodeInfos.map((info) => [info.node.id, info]))
  const sectionMemberIds = new Set((canvas.sections ?? []).flatMap((section) => section.memberIds))
  const lines: string[] = [`Active canvas: ${formatWorkspaceCanvasPath(canvasPath)}`]

  lines.push('', 'Sections:')
  if (canvas.sections && canvas.sections.length > 0) {
    for (const section of canvas.sections) {
      const columns = section.layout === 'grid' && section.columns ? `, columns: ${section.columns}` : ''
      lines.push(
        `- ${section.title} (layout: ${section.layout}${columns}, position: x=${formatNumber(section.position.x)}, y=${formatNumber(section.position.y)})`
      )

      const memberPaths = section.memberIds
        .map((memberId) => nodeInfoById.get(memberId)?.path)
        .filter((path): path is string => typeof path === 'string')

      if (memberPaths.length === 0) {
        lines.push('  files: none')
      } else {
        lines.push('  files:')
        for (const path of memberPaths) {
          lines.push(`  - ${formatWorkspaceFilePath(path)}`)
        }
      }
    }
  } else {
    lines.push('- none')
  }

  const unsectionedNodeInfos = nodeInfos.filter((info) => !sectionMemberIds.has(info.node.id))
  lines.push('', 'Unsectioned files:')
  if (unsectionedNodeInfos.length === 0) {
    lines.push('- none')
  } else {
    for (const { node, path } of unsectionedNodeInfos) {
      lines.push(
        `- ${formatWorkspaceFilePath(path)}: position x=${formatNumber(node.xynode.position.x)}, y=${formatNumber(node.xynode.position.y)}`
      )
    }
  }

  return lines.join('\n')
}

function findCanvasById(canvas: CanvasItem, canvasId: string): CanvasItem | null {
  if (canvas.id === canvasId) {
    return canvas
  }

  for (const item of canvas.items) {
    if (item.kind !== 'canvas') {
      continue
    }

    const found = findCanvasById(item, canvasId)
    if (found) {
      return found
    }
  }

  return null
}

function resolveNowMs(now: ActiveCanvasContextOptions['now']): number {
  if (now instanceof Date) {
    return now.getTime()
  }

  if (typeof now === 'number') {
    return now
  }

  if (typeof now === 'string') {
    const parsed = Date.parse(now)
    return Number.isNaN(parsed) ? Date.now() : parsed
  }

  return Date.now()
}

function formatRelativeTimestamp(timestamp: string | undefined, nowMs: number): string {
  if (!timestamp) {
    return 'unknown'
  }

  const timestampMs = Date.parse(timestamp)
  if (Number.isNaN(timestampMs)) {
    return 'unknown'
  }

  const diffMs = nowMs - timestampMs
  const suffix = diffMs < 0 ? 'from now' : 'ago'
  const absMs = Math.abs(diffMs)
  const minutes = Math.floor(absMs / 60_000)
  if (minutes < 1) {
    return 'now'
  }

  if (minutes < 60) {
    return `${minutes} min ${suffix}`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} h ${suffix}`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days} d ${suffix}`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months} mo ${suffix}`
  }

  const years = Math.floor(days / 365)
  return `${years} y ${suffix}`
}

function getNodeAudit(node: NodeItem): AuditFields | undefined {
  return node.xynode.data?.audit
}

function formatAuditTimestamps(audit: AuditFields | undefined, nowMs: number | undefined): string {
  const resolvedNowMs = nowMs ?? Date.now()
  return `created ${formatRelativeTimestamp(audit?.createdAt, resolvedNowMs)}; updated ${formatRelativeTimestamp(
    audit?.updatedAt,
    resolvedNowMs
  )}`
}

function formatWorkspaceCanvasPath(path: string): string {
  return path === '' ? '/workspace/' : `/workspace/${path}/`
}

function formatWorkspaceFilePath(path: string): string {
  return `/workspace/${path}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function formatWorkspaceTreeFileName(item: WorkspaceTreeItem, options: WorkspaceTreeFormatOptions): string {
  if (!item.includeAudit) {
    return item.name
  }

  return `${item.name} (${formatAuditTimestamps(item.audit, options.nowMs)})`
}

function formatCanvas(
  canvas: CanvasItem,
  prefix: string,
  isLast: boolean,
  lines: string[],
  pathMapper: PathMapper,
  options: WorkspaceTreeFormatOptions = {}
): void {
  const connector = isLast ? '`-- ' : '|-- '
  const name = pathMapper.getPathForCanvas(canvas.id)?.split('/').pop() ?? sanitizeFilename(canvas.name)
  lines.push(`${prefix}${connector}${name}`)

  const newPrefix = prefix + (isLast ? '    ' : '|   ')

  // Filter items by kind
  const nodeItems = canvas.items.filter((item): item is NodeItem => item.kind === 'node')
  const canvasItems = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')

  // Sort by name
  const sortedNodes = [...nodeItems].sort((a, b) => a.name.localeCompare(b.name))
  const sortedChildren = [...canvasItems].sort((a, b) => a.name.localeCompare(b.name))

  // Collect all items in this canvas: metadata.yaml, node files, and child canvases
  const allItems: WorkspaceTreeItem[] = []

  // Add metadata.yaml first
  allItems.push({ type: 'file', name: 'metadata.yaml' })

  // Add node files
  for (const node of sortedNodes) {
    const nodePath = pathMapper.getPathForNode(node.id)
    if (nodePath) {
      allItems.push({
        type: 'file',
        name: nodePath.split('/').pop() ?? nodePath,
        includeAudit: options.auditCanvasId === canvas.id,
        audit: getNodeAudit(node),
      })
    }
  }

  // Add child canvases
  for (const child of sortedChildren) {
    allItems.push({ type: 'canvas', name: sanitizeFilename(child.name), canvas: child })
  }

  for (let i = 0; i < allItems.length; i++) {
    const itemIsLast = i === allItems.length - 1
    const item = allItems[i]

    if (item.type === 'file') {
      const fileConnector = itemIsLast ? '`-- ' : '|-- '
      lines.push(`${newPrefix}${fileConnector}${formatWorkspaceTreeFileName(item, options)}`)
    } else if (item.canvas) {
      formatCanvas(item.canvas, newPrefix, itemIsLast, lines, pathMapper, options)
    }
  }
}

/**
 * Find the breadcrumb path to a canvas by its ID.
 * Returns path like "templates/emails/newsletter" or null if not found.
 * Returns empty string for root canvas.
 */
export function findCanvasPath(doc: WorkspaceDocument, canvasId: string): string | null {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(doc)
  return findCanvasPathWithPathMapper(doc, canvasId, pathMapper)
}

function findCanvasPathWithPathMapper(doc: WorkspaceDocument, canvasId: string, pathMapper: PathMapper): string | null {
  const root = doc.root
  if (!root) return null
  return pathMapper.getPathForCanvas(canvasId) ?? null
}

/**
 * Information about a selected node
 */
export interface SelectedNodeInfo {
  id: string
  name: string
  path: string // Full path like "templates/emails/newsletter/feature-brainstorm.md"
  canvasPath: string // Canvas path like "templates/emails/newsletter"
}

/**
 * Get node details for selected node IDs.
 * Returns info including the full path for each node.
 */
export function getSelectedNodesInfo(doc: WorkspaceDocument, nodeIds: string[]): SelectedNodeInfo[] {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(doc)
  return getSelectedNodesInfoWithPathMapper(doc, nodeIds, pathMapper)
}

function getSelectedNodesInfoWithPathMapper(
  doc: WorkspaceDocument,
  nodeIds: string[],
  pathMapper: PathMapper
): SelectedNodeInfo[] {
  const results: SelectedNodeInfo[] = []
  const nodeIdSet = new Set(nodeIds)

  const root = doc.root
  if (!root) return results

  // Search root canvas nodes
  const rootNodes = root.items.filter((item): item is NodeItem => item.kind === 'node')
  for (const node of rootNodes) {
    if (nodeIdSet.has(node.id)) {
      const path = pathMapper.getPathForNode(node.id)
      if (!path) continue
      results.push({
        id: node.id,
        name: node.name,
        path,
        canvasPath: pathMapper.getPathForCanvas(root.id) ?? '',
      })
    }
  }

  // Search child canvases recursively
  function searchCanvases(canvases: CanvasItem[]): void {
    for (const canvas of canvases) {
      const canvasPath = pathMapper.getPathForCanvas(canvas.id) ?? ''

      // Search nodes in this canvas
      const canvasNodes = canvas.items.filter((item): item is NodeItem => item.kind === 'node')
      for (const node of canvasNodes) {
        if (nodeIdSet.has(node.id)) {
          const path = pathMapper.getPathForNode(node.id)
          if (!path) continue
          results.push({
            id: node.id,
            name: node.name,
            path,
            canvasPath,
          })
        }
      }

      // Search child canvases recursively
      const childCanvases = canvas.items.filter((item): item is CanvasItem => item.kind === 'canvas')
      if (childCanvases.length > 0) {
        searchCanvases(childCanvases)
      }
    }
  }

  const rootChildCanvases = root.items.filter((item): item is CanvasItem => item.kind === 'canvas')
  searchCanvases(rootChildCanvases)
  return results
}
