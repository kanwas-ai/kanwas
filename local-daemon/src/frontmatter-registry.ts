// Node-id → frontmatter-block registry.
//
// Populated on the disk→yDoc read path (adoption + the live orchestrator) when a
// `.md` file's frontmatter is split off, consumed on the yDoc→disk write path
// (the flusher) to re-prepend it. Keyed by node id, which is stable across
// restarts (carried by metadata.yaml), so the registry is faithfully rebuilt at
// every boot from the actual files on disk.
export class FrontmatterRegistry {
  private readonly byNodeId = new Map<string, string>()

  /** Record the frontmatter block for a node ('' clears — the node has none). */
  set(nodeId: string, frontmatter: string): void {
    if (frontmatter) this.byNodeId.set(nodeId, frontmatter)
    else this.byNodeId.delete(nodeId)
  }

  /** Get the stashed frontmatter for a node, or '' when none is known. */
  get(nodeId: string): string {
    return this.byNodeId.get(nodeId) ?? ''
  }

  has(nodeId: string): boolean {
    return this.byNodeId.has(nodeId)
  }

  delete(nodeId: string): void {
    this.byNodeId.delete(nodeId)
  }

  get size(): number {
    return this.byNodeId.size
  }
}
