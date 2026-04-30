import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import { buildWorkspaceInterlinkSuggestions, filterWorkspaceInterlinkSuggestions } from '@/lib/workspaceInterlinks'

function createNode(id: string, name: string): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
      measured: { width: 300, height: 200 },
    },
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

describe('workspace interlink suggestion utilities', () => {
  const archiveCanvas = createCanvas('canvas-archive', 'Archive', [createNode('node-archive', 'Archive Note')])
  const projectCanvas = createCanvas('canvas-project', 'Project', [createNode('node-task', 'Task List')])
  const root = createCanvas('root', 'Workspace', [createNode('node-doc', 'Doc One'), projectCanvas, archiveCanvas])

  it('builds canvas and node suggestions with workspace hrefs', () => {
    const suggestions = buildWorkspaceInterlinkSuggestions(root, 'canvas-project')

    const docSuggestion = suggestions.find((item) => item.id === 'node-doc')
    const projectCanvasSuggestion = suggestions.find((item) => item.id === 'canvas-project' && item.kind === 'canvas')

    expect(docSuggestion?.href).toBe('/workspace/doc-one.md')
    expect(projectCanvasSuggestion?.href).toBe('/workspace/project/')
  })

  it('includes suggestions from every canvas without special filtering', () => {
    const suggestions = buildWorkspaceInterlinkSuggestions(root, null)

    expect(suggestions.some((item) => item.id === 'node-archive')).toBe(true)
    expect(suggestions.some((item) => item.id === 'canvas-archive' && item.kind === 'canvas')).toBe(true)
  })

  it('filters suggestions by title, path, and aliases', () => {
    const suggestions = buildWorkspaceInterlinkSuggestions(root, null)

    expect(filterWorkspaceInterlinkSuggestions(suggestions, 'task').some((item) => item.id === 'node-task')).toBe(true)
    expect(
      filterWorkspaceInterlinkSuggestions(suggestions, 'project').some((item) => item.id === 'canvas-project')
    ).toBe(true)
    expect(filterWorkspaceInterlinkSuggestions(suggestions, 'home').length).toBeGreaterThan(0)
  })
})
