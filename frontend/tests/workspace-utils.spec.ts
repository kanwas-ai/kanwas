import { describe, expect, it } from 'vitest'
import {
  KANWAS_SYSTEM_NODE_KIND,
  findCanonicalKanwasNode,
  findCanonicalKanwasNodeId,
  isKanwasExplicitlyEdited,
  markKanwasNodeAsExplicitlyEdited,
  resolveCanvasPath,
  resolveWorkspaceLink,
  resolveWorkspacePath,
} from '@/lib/workspaceUtils'
import type { CanvasItem, NodeItem } from 'shared/path-mapper'

function createNode(
  id: string,
  name: string,
  type: NodeItem['xynode']['type'],
  data: Record<string, unknown> = {}
): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type,
      position: { x: 0, y: 0 },
      data,
    } as NodeItem['xynode'],
  }
}

function createCanvas(id: string, name: string, items: Array<NodeItem | CanvasItem> = []): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

function createWorkspaceRoot(items: Array<NodeItem | CanvasItem>): CanvasItem {
  return createCanvas('root', '', items)
}

describe('resolveWorkspaceLink', () => {
  it('resolves lowercase canonical node links including dedupe and node-type extensions', () => {
    const root = createWorkspaceRoot([
      createCanvas('research-canvas', 'Research', [
        createNode('a-note', 'Brief', 'blockNote', {}),
        createNode('b-note', 'Brief', 'blockNote', {}),
        createNode('c-link', 'Competitor Link', 'link', {
          url: 'https://example.com',
          loadingStatus: 'loaded',
        }),
        createNode('d-image', 'Screenshot', 'image', {
          storagePath: 'files/workspace/research/screenshot.png',
          mimeType: 'image/png',
          size: 123,
          contentHash: 'hash-image',
        }),
        createNode('e-file', 'Spec', 'file', {
          storagePath: 'files/workspace/research/spec.pdf',
          mimeType: 'application/pdf',
          size: 456,
          originalFilename: 'spec.pdf',
          contentHash: 'hash-file',
        }),
        createNode('f-audio', 'Interview', 'audio', {
          storagePath: 'files/workspace/research/interview.mp3',
          mimeType: 'audio/mpeg',
          size: 789,
          originalFilename: 'interview.mp3',
          contentHash: 'hash-audio',
        }),
      ]),
    ])

    expect(resolveWorkspaceLink(root, '/workspace/research/brief.md')).toMatchObject({
      type: 'node',
      nodeId: 'a-note',
      canvasId: 'research-canvas',
    })

    expect(resolveWorkspaceLink(root, '/workspace/research/brief-2.md')).toMatchObject({
      type: 'node',
      nodeId: 'b-note',
      canvasId: 'research-canvas',
    })

    expect(resolveWorkspaceLink(root, '/workspace/research/competitor-link.url.yaml')).toMatchObject({
      type: 'node',
      nodeId: 'c-link',
      canvasId: 'research-canvas',
    })

    expect(resolveWorkspaceLink(root, '/workspace/research/screenshot.png')).toMatchObject({
      type: 'node',
      nodeId: 'd-image',
      canvasId: 'research-canvas',
    })

    expect(resolveWorkspaceLink(root, '/workspace/research/spec.pdf')).toMatchObject({
      type: 'node',
      nodeId: 'e-file',
      canvasId: 'research-canvas',
    })

    expect(resolveWorkspaceLink(root, '/workspace/research/interview.mp3')).toMatchObject({
      type: 'node',
      nodeId: 'f-audio',
      canvasId: 'research-canvas',
    })
  })

  it('resolves canvas-only links including root and links with query/hash', () => {
    const root = createWorkspaceRoot([
      createCanvas('planning', 'Planning', [createNode('node-1', 'Plan', 'blockNote', {})]),
    ])

    expect(resolveWorkspaceLink(root, '/workspace/planning/')).toEqual({ type: 'canvas', canvasId: 'planning' })
    expect(resolveWorkspaceLink(root, '/workspace/planning')).toEqual({ type: 'canvas', canvasId: 'planning' })
    expect(resolveWorkspaceLink(root, '/workspace/planning/plan.md?view=1#section')).toMatchObject({
      type: 'node',
      nodeId: 'node-1',
      canvasId: 'planning',
    })
    expect(resolveWorkspaceLink(root, '/workspace/')).toEqual({ type: 'canvas', canvasId: 'root' })
    expect(resolveWorkspaceLink(root, '/workspace')).toEqual({ type: 'canvas', canvasId: 'root' })
  })

  it('marks metadata links as unsupported', () => {
    const root = createWorkspaceRoot([createCanvas('planning', 'Planning')])

    expect(resolveWorkspaceLink(root, '/workspace/planning/metadata.yaml')).toEqual({
      type: 'unsupported',
      reason: 'metadata',
    })

    expect(resolveWorkspaceLink(root, '/workspace/metadata.yaml')).toEqual({
      type: 'unsupported',
      reason: 'metadata',
    })
  })

  it('returns unresolved for missing canonical targets and external for non-workspace links', () => {
    const root = createWorkspaceRoot([createCanvas('planning', 'Planning')])

    expect(resolveWorkspaceLink(root, '/workspace/planning/missing.md')).toEqual({ type: 'unresolved' })
    expect(resolveWorkspaceLink(root, '/workspace/planning/missing')).toEqual({ type: 'unresolved' })
    expect(resolveWorkspaceLink(root, 'https://example.com/docs')).toEqual({ type: 'external' })
    expect(resolveWorkspaceLink(root, 'https://example.com/workspace/planning/plan.md')).toEqual({ type: 'external' })
    expect(resolveWorkspaceLink(root, 'ftp://example.com/workspace/planning/plan.md')).toEqual({ type: 'external' })
    expect(resolveWorkspaceLink(root, 'file:///workspace/planning/plan.md')).toEqual({ type: 'external' })
  })
})

describe('workspace path wrappers', () => {
  it('keeps resolveWorkspacePath and resolveCanvasPath behavior', () => {
    const root = createWorkspaceRoot([
      createCanvas('planning', 'Planning', [createNode('node-1', 'Plan', 'blockNote', {})]),
    ])

    expect(resolveWorkspacePath(root, '/workspace/planning/plan.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning',
    })
    expect(resolveWorkspacePath(root, '/workspace/planning/')).toBeNull()

    expect(resolveCanvasPath(root, '/workspace/planning/')).toBe('planning')
    expect(resolveCanvasPath(root, '/workspace/planning/plan.md')).toBeNull()
  })

  it('resolves unsanitized links with spaces to sanitized workspace mappings', () => {
    const root = createWorkspaceRoot([
      createCanvas('planning-board', 'Planning Board', [createNode('node-1', 'My File', 'blockNote', {})]),
    ])

    expect(resolveWorkspacePath(root, '/workspace/Planning Board/My File.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning-board',
    })

    expect(resolveWorkspacePath(root, '/workspace/Planning%20Board/My%20File.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning-board',
    })

    expect(resolveCanvasPath(root, '/workspace/Planning Board/')).toBe('planning-board')
  })

  it('resolves unsanitized space paths using original names when sanitized paths collide', () => {
    const root = createWorkspaceRoot([
      createCanvas('a-dash', 'Planning-Board', [createNode('dash-node', 'My-File', 'blockNote', {})]),
      createCanvas('z-space', 'Planning Board', [createNode('space-node', 'My File', 'blockNote', {})]),
    ])

    expect(resolveWorkspacePath(root, '/workspace/Planning-Board/My-File.md')).toEqual({
      nodeId: 'dash-node',
      canvasId: 'a-dash',
    })

    expect(resolveWorkspacePath(root, '/workspace/Planning Board/My File.md')).toEqual({
      nodeId: 'space-node',
      canvasId: 'z-space',
    })

    expect(resolveCanvasPath(root, '/workspace/Planning Board/')).toBe('z-space')
  })

  it('returns unresolved for ambiguous unsanitized paths that match multiple originals', () => {
    const root = createWorkspaceRoot([
      createCanvas('planning', 'Planning Board', [
        createNode('node-1', 'My File', 'blockNote', {}),
        createNode('node-2', 'My File', 'blockNote', {}),
      ]),
    ])

    expect(resolveWorkspaceLink(root, '/workspace/Planning Board/My File.md')).toEqual({ type: 'unresolved' })
  })

  it('uses fresh mappings after node rename', () => {
    const planning = createCanvas('planning', 'Planning', [createNode('node-1', 'Plan', 'blockNote', {})])
    const root = createWorkspaceRoot([planning])

    expect(resolveWorkspacePath(root, '/workspace/planning/plan.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning',
    })

    const node = planning.items[0]
    if (node.kind !== 'node') {
      throw new Error('Expected first planning item to be a node')
    }
    node.name = 'Plan Updated'

    expect(resolveWorkspacePath(root, '/workspace/planning/plan.md')).toBeNull()
    expect(resolveWorkspacePath(root, '/workspace/planning/plan-updated.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning',
    })
  })

  it('uses fresh mappings after moving nodes between canvases', () => {
    const node = createNode('node-1', 'Plan', 'blockNote', {})
    const planning = createCanvas('planning', 'Planning', [node])
    const archive = createCanvas('archive', 'Archive', [])
    const root = createWorkspaceRoot([planning, archive])

    expect(resolveWorkspacePath(root, '/workspace/planning/plan.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'planning',
    })

    planning.items = []
    archive.items = [node]

    expect(resolveWorkspacePath(root, '/workspace/planning/plan.md')).toBeNull()
    expect(resolveWorkspacePath(root, '/workspace/archive/plan.md')).toEqual({
      nodeId: 'node-1',
      canvasId: 'archive',
    })
  })
})

describe('findCanonicalKanwasNode', () => {
  function createKanwasNode(id: string, name = 'Kanwas', explicitlyEdited = false): NodeItem {
    return createNode(id, name, 'blockNote', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
      ...(explicitlyEdited ? { explicitlyEdited: true } : {}),
    })
  }

  it('picks the first marker found in workspace tree order', () => {
    const firstNested = createKanwasNode('kanwas-first')
    const rootMarker = createKanwasNode('kanwas-root')
    const root = createWorkspaceRoot([
      createCanvas('archive', 'Archive', [firstNested]),
      rootMarker,
      createCanvas('ideas', 'Ideas', [createKanwasNode('kanwas-later')]),
    ])

    const located = findCanonicalKanwasNode(root)

    expect(located?.node.id).toBe('kanwas-first')
    expect(located?.canvasId).toBe('archive')
    expect(findCanonicalKanwasNodeId(root)).toBe('kanwas-first')
  })

  it('returns null when markers are missing', () => {
    const root = createWorkspaceRoot([
      createCanvas('planning', 'Planning', [createNode('note-1', 'Plan', 'blockNote', {})]),
    ])

    expect(findCanonicalKanwasNode(root)).toBeNull()
    expect(findCanonicalKanwasNodeId(root)).toBeNull()
  })

  it('rebuilds first-marker lookup after move and delete operations', () => {
    const primary = createKanwasNode('kanwas-main')
    const fallback = createKanwasNode('kanwas-fallback')
    const planning = createCanvas('planning', 'Planning', [primary])
    const archive = createCanvas('archive', 'Archive', [fallback])
    const root = createWorkspaceRoot([planning, archive])

    expect(findCanonicalKanwasNode(root)?.node.id).toBe('kanwas-main')

    planning.items = []

    expect(findCanonicalKanwasNode(root)?.node.id).toBe('kanwas-fallback')

    archive.items = []

    expect(findCanonicalKanwasNode(root)).toBeNull()
  })
})

describe('isKanwasExplicitlyEdited', () => {
  it('only returns true when explicitlyEdited is set on the kanwas marker', () => {
    const localEditNode = createNode('kanwas-local', 'Kanwas', 'blockNote', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
      explicitlyEdited: true,
    })
    const remoteOnlyNode = createNode('kanwas-remote', 'Kanwas', 'blockNote', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
    })

    expect(isKanwasExplicitlyEdited(localEditNode)).toBe(true)
    expect(isKanwasExplicitlyEdited(remoteOnlyNode)).toBe(false)
  })

  it('marks the canonical kanwas node as explicitly edited in place', () => {
    const kanwasNode = createNode('kanwas-local', 'Kanwas', 'blockNote', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
    })
    const root = createWorkspaceRoot([createCanvas('notes', 'Notes', [kanwasNode])])

    expect(markKanwasNodeAsExplicitlyEdited(root, 'kanwas-local')).toBe(true)
    expect(isKanwasExplicitlyEdited(kanwasNode)).toBe(true)
    expect(markKanwasNodeAsExplicitlyEdited(root, 'kanwas-local')).toBe(false)
  })
})
