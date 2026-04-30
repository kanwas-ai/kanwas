import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import { findToolbarPlacementSection, shouldBlockToolbarPlacementTarget } from '@/components/canvas/useToolbarPlacement'

function makeNode(id: string, x: number, y: number, width = 240, height = 80): NodeItem {
  return {
    kind: 'node',
    id,
    name: id,
    xynode: {
      id,
      type: 'text',
      position: { x, y },
      measured: { width, height },
      data: { content: id },
    },
  } as NodeItem
}

describe('toolbar placement targeting', () => {
  it('allows section background nodes but still blocks regular nodes and edges', () => {
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [makeNode('node-1', 120, 180)],
      sections: [
        {
          id: 'section-1',
          title: 'Section',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: ['node-1'],
        },
      ],
    }

    const pane = document.createElement('div')
    pane.className = 'react-flow__pane'

    const sectionNode = document.createElement('div')
    sectionNode.className = 'react-flow__node'
    sectionNode.setAttribute('data-id', 'section-1')
    const sectionChild = document.createElement('span')
    sectionNode.appendChild(sectionChild)
    pane.appendChild(sectionNode)

    const regularNode = document.createElement('div')
    regularNode.className = 'react-flow__node'
    regularNode.setAttribute('data-id', 'node-1')
    const regularChild = document.createElement('span')
    regularNode.appendChild(regularChild)
    pane.appendChild(regularNode)

    const edge = document.createElement('div')
    edge.className = 'react-flow__edge'
    const edgeChild = document.createElement('span')
    edge.appendChild(edgeChild)
    pane.appendChild(edge)

    document.body.appendChild(pane)

    expect(shouldBlockToolbarPlacementTarget(sectionChild, canvas)).toBe(false)
    expect(shouldBlockToolbarPlacementTarget(regularChild, canvas)).toBe(true)
    expect(shouldBlockToolbarPlacementTarget(edgeChild, canvas)).toBe(true)
  })

  it('detects section placement from a flow position inside section bounds', () => {
    const member = makeNode('node-1', 120, 206)
    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [member],
      sections: [
        {
          id: 'section-1',
          title: 'Section',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [member.id],
        },
      ],
    }

    const section = findToolbarPlacementSection(canvas, { x: 180, y: 240 })

    expect(section?.id).toBe('section-1')
  })
})
