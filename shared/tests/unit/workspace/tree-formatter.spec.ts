import { describe, expect, it } from 'vitest'
import type { AuditFields } from '../../../src/types.js'
import type { CanvasItem, NodeItem, StickyNoteNode, TextNode, WorkspaceDocument } from '../../../src/types.js'
import {
  formatActiveCanvasContext,
  formatWorkspaceInvokeContext,
  formatWorkspaceTree,
  getSelectedNodesInfo,
} from '../../../src/workspace/tree-formatter.js'

function createRootCanvas(items: Array<CanvasItem | NodeItem>): CanvasItem {
  return {
    kind: 'canvas',
    id: 'root',
    name: '',
    xynode: { id: 'root', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    items,
    edges: [],
  }
}

function createCanvas(id: string, name: string, items: Array<CanvasItem | NodeItem>): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: { id, type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    items,
    edges: [],
  }
}

function createTextNode(
  id: string,
  name: string,
  options: { position?: { x: number; y: number }; audit?: AuditFields } = {}
): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'text',
      position: options.position ?? { x: 0, y: 0 },
      data: { content: '', ...(options.audit ? { audit: options.audit } : {}) },
    } as TextNode,
  }
}

function createStickyNode(id: string, name: string): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: { id, type: 'stickyNote', position: { x: 0, y: 0 }, data: { color: 'yellow' } } as StickyNoteNode,
  }
}

describe('tree formatter', () => {
  it('shows canonical yaml filenames in workspace trees', () => {
    const doc: WorkspaceDocument = {
      root: createRootCanvas([
        createCanvas('canvas-1', 'Context', [createTextNode('node-1', 'Callout'), createStickyNode('node-2', 'Retro')]),
      ]),
    }

    expect(formatWorkspaceTree(doc)).toContain('callout.text.yaml')
    expect(formatWorkspaceTree(doc)).toContain('retro.sticky.yaml')
  })

  it('returns canonical selected node paths', () => {
    const doc: WorkspaceDocument = {
      root: createRootCanvas([
        createCanvas('canvas-1', 'Context', [createTextNode('node-1', 'Callout'), createStickyNode('node-2', 'Retro')]),
      ]),
    }

    expect(getSelectedNodesInfo(doc, ['node-1', 'node-2'])).toEqual([
      { id: 'node-1', name: 'Callout', path: 'context/callout.text.yaml', canvasPath: 'context' },
      { id: 'node-2', name: 'Retro', path: 'context/retro.sticky.yaml', canvasPath: 'context' },
    ])
  })

  it('formats active canvas sections and unsectioned positions', () => {
    const canvas = createCanvas('canvas-1', 'Context', [
      createTextNode('node-1', 'Overview', {
        position: { x: 10, y: 20 },
        audit: {
          createdAt: '2026-04-24T11:55:00.000Z',
          updatedAt: '2026-04-24T10:00:00.000Z',
        },
      }),
      createStickyNode('node-2', 'Retro'),
      createTextNode('node-3', 'Loose', {
        position: { x: 300.5, y: 400.25 },
      }),
    ])
    canvas.sections = [
      {
        id: 'section-1',
        title: '🧭 Overview',
        layout: 'horizontal',
        position: { x: 120, y: 240 },
        memberIds: ['node-2', 'node-1'],
      },
    ]

    const doc: WorkspaceDocument = {
      root: createRootCanvas([canvas]),
    }

    expect(formatActiveCanvasContext(doc, 'canvas-1', { now: '2026-04-24T12:00:00.000Z' })).toBe(
      [
        'Active canvas: /workspace/context/',
        '',
        'Sections:',
        '- 🧭 Overview (layout: horizontal, position: x=120, y=240)',
        '  files:',
        '  - /workspace/context/retro.sticky.yaml',
        '  - /workspace/context/overview.text.yaml',
        '',
        'Unsectioned files:',
        '- /workspace/context/loose.text.yaml: position x=300.5, y=400.25',
      ].join('\n')
    )
  })

  it('builds frontend invoke context from one workspace snapshot', () => {
    const canvas = createCanvas('canvas-1', 'Context', [
      createTextNode('node-1', 'Selected', {
        audit: {
          createdAt: '2026-04-24T11:55:00.000Z',
          updatedAt: '2026-04-24T10:00:00.000Z',
        },
      }),
      createStickyNode('node-2', 'Mentioned'),
    ])
    const doc: WorkspaceDocument = {
      root: createRootCanvas([canvas]),
    }

    expect(
      formatWorkspaceInvokeContext(doc, {
        canvasId: 'canvas-1',
        selectedNodeIds: ['node-1'],
        mentionedNodeIds: ['node-2'],
        now: '2026-04-24T12:00:00.000Z',
      })
    ).toEqual({
      workspaceTree: [
        '/workspace',
        '|-- metadata.yaml',
        '`-- context',
        '    |-- metadata.yaml',
        '    |-- mentioned.sticky.yaml (created unknown; updated unknown)',
        '    `-- selected.text.yaml (created 5 min ago; updated 2 h ago)',
      ].join('\n'),
      canvasPath: 'context',
      activeCanvasContext: [
        'Active canvas: /workspace/context/',
        '',
        'Sections:',
        '- none',
        '',
        'Unsectioned files:',
        '- /workspace/context/mentioned.sticky.yaml: position x=0, y=0',
        '- /workspace/context/selected.text.yaml: position x=0, y=0',
      ].join('\n'),
      selectedNodePaths: ['context/selected.text.yaml'],
      mentionedNodePaths: ['context/mentioned.sticky.yaml'],
    })
  })

  it('returns null when active canvas cannot be found', () => {
    const doc: WorkspaceDocument = {
      root: createRootCanvas([createCanvas('canvas-1', 'Context', [])]),
    }

    expect(formatActiveCanvasContext(doc, 'missing-canvas')).toBeNull()
  })
})
