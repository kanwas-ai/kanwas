// Canonical `metadata.yaml` construction from a live canvas node.
//
// Shared by the MetadataManager (materialize + folder→yDoc sidecar refresh) and
// the FolderFlusher (yDoc→folder structure flush). Both MUST emit byte-identical
// bytes for the same tree state, because suppression is by byte-identity: if the
// flusher's serialization differed from the sidecar the orchestrator materialized
// at boot, an otherwise-unchanged canvas would rewrite and echo on every flush.
//
// Determinism: node order follows tree (item) order, which adoption reconstructs
// from the stored metadata order, so it is stable across restarts. Audit fields
// are stripped (single local user, no cloud identity).
import type { CanvasItem, CanvasMetadata, NodeItem } from 'shared'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripAudit(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!isObjectRecord(data)) return {}
  return Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'audit'))
}

export function buildCanvasMetadata(canvas: CanvasItem): CanvasMetadata {
  const nodeItems = canvas.items.filter((item): item is NodeItem => item.kind === 'node')
  return {
    id: canvas.id,
    name: canvas.name,
    xynode: {
      position: { ...canvas.xynode.position },
      ...(canvas.xynode.measured ? { measured: { ...canvas.xynode.measured } } : {}),
    },
    edges: canvas.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    nodes: nodeItems.map((nodeItem) => ({
      id: nodeItem.id,
      name: nodeItem.name,
      xynode: {
        id: nodeItem.xynode.id,
        type: nodeItem.xynode.type,
        position: { ...nodeItem.xynode.position },
        ...(nodeItem.xynode.measured ? { measured: { ...nodeItem.xynode.measured } } : {}),
        data: stripAudit(nodeItem.xynode.data as Record<string, unknown> | undefined),
        ...(typeof nodeItem.xynode.width === 'number' ? { width: nodeItem.xynode.width } : {}),
        ...(typeof nodeItem.xynode.height === 'number' ? { height: nodeItem.xynode.height } : {}),
      },
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
