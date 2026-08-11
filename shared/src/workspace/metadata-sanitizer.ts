function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeCanvasMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const normalizedNodes = Array.isArray(metadata.nodes)
    ? metadata.nodes.map((node) => {
        if (!isObjectRecord(node) || !isObjectRecord(node.xynode)) {
          return node
        }

        return {
          ...node,
          xynode: { ...node.xynode },
        }
      })
    : metadata.nodes

  return {
    ...metadata,
    ...(isObjectRecord(metadata.xynode) ? { xynode: { ...metadata.xynode } } : {}),
    ...(metadata.nodes !== undefined ? { nodes: normalizedNodes } : {}),
  }
}
