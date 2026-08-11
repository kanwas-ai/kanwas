import { inject } from '@adonisjs/core'
import * as Y from 'yjs'
import { ContentConverter, createWorkspaceContentStore, createWorkspaceSnapshotBundle } from 'shared/server'
import {
  type WorkspaceSnapshotBundle,
  type WorkspaceDocument,
  type NodeItem,
  stampCreateAuditOnCanvas,
  stampCreateAuditOnNode,
} from 'shared'
import { NODE_LAYOUT } from 'shared/constants'
import { createYjsProxy } from 'valtio-y'

const KANWAS_SYSTEM_NODE_KIND = 'kanwas_md' as const
const KANWAS_DEFAULT_MARKDOWN = `# Instructions

Use this file to set workspace-specific rules and working preferences for this project.

## Example instructions
- "Act like a PM sparring partner: challenge assumptions, name the biggest risk, and ask the one question that would change the decision."
- "When proposing options, keep it to 2-3 paths and include expected KPI impact, downside risk, and the trigger for choosing each path."
- "Workspace rule: treat /decisions as append-only and add dated updates instead of rewriting past decisions."`

export interface CreateWorkspaceBootstrapOptions {
  ownerUserId?: string
}

/** Collects node IDs + markdown for batch fragment seeding */
type FragmentEntry = { nodeId: string; markdown: string }

@inject()
export default class WorkspaceBootstrapService {
  private getAuditMetadata(ownerUserId: string | undefined) {
    return {
      actor: ownerUserId ? `user:${ownerUserId}` : undefined,
      timestamp: new Date().toISOString(),
    }
  }

  private buildKanwasNode(fragments: FragmentEntry[]): NodeItem {
    const id = crypto.randomUUID()
    const position = {
      x: NODE_LAYOUT.INITIAL_POSITION.x + NODE_LAYOUT.WIDTH + NODE_LAYOUT.GAP,
      y: NODE_LAYOUT.INITIAL_POSITION.y,
    }
    fragments.push({ nodeId: id, markdown: KANWAS_DEFAULT_MARKDOWN })
    return {
      id,
      name: 'instructions',
      kind: 'node',
      xynode: {
        id,
        type: 'blockNote',
        position,
        data: { systemNodeKind: KANWAS_SYSTEM_NODE_KIND, explicitlyEdited: false },
      },
    }
  }

  private buildDefaultRoot(fragments: FragmentEntry[]): WorkspaceDocument['root'] {
    const kanwasNode = this.buildKanwasNode(fragments)
    return {
      id: 'root',
      name: '',
      kind: 'canvas',
      xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [kanwasNode],
    }
  }

  private async seedNoteSubdocs(yDoc: Y.Doc, fragments: FragmentEntry[]): Promise<void> {
    const contentStore = createWorkspaceContentStore(yDoc)
    const converter = new ContentConverter()

    for (const { nodeId, markdown } of fragments) {
      contentStore.createNoteDoc(nodeId, 'blockNote')
      const fragment = contentStore.getBlockNoteFragment(nodeId)
      if (!fragment) {
        throw new Error(`Expected attached BlockNote fragment for bootstrap note ${nodeId}`)
      }

      await converter.updateFragmentFromMarkdown(fragment, markdown, {
        nodeId,
        source: 'workspace-bootstrap',
      })
    }
  }

  private stampBootstrapAudit(canvas: WorkspaceDocument['root'], actor: string | undefined, nowIso: string): void {
    stampCreateAuditOnCanvas(canvas, actor, nowIso)
    for (const item of canvas.items) {
      if (item.kind === 'canvas') {
        this.stampBootstrapAudit(item, actor, nowIso)
      } else {
        stampCreateAuditOnNode(item, actor, nowIso)
      }
    }
  }

  /**
   * Create a workspace snapshot bundle using note subdocs.
   */
  async createSnapshotBundle(options: CreateWorkspaceBootstrapOptions = {}): Promise<WorkspaceSnapshotBundle> {
    const yDoc = new Y.Doc()
    const audit = this.getAuditMetadata(options.ownerUserId)
    const fragments: FragmentEntry[] = []
    const root = this.buildDefaultRoot(fragments)

    const { bootstrap, proxy } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    bootstrap({ root })

    this.stampBootstrapAudit(proxy.root, audit.actor, audit.timestamp)
    await this.seedNoteSubdocs(yDoc, fragments)

    return createWorkspaceSnapshotBundle(yDoc)
  }
}
