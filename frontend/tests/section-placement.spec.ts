import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared'
import { resolvePendingSectionPlacements } from '@/components/canvas/section'
import {
  buildSectionLayouts,
  resolvePendingSectionPosition,
  resolveSectionCollisionPositions,
} from '@/components/canvas/section/layout'

function makeNode(id: string, name: string, x: number, y: number, width: number, height: number): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'text',
      position: { x, y },
      measured: { width, height },
      data: { content: name },
    },
  } as NodeItem
}

describe('section placement resolution', () => {
  it('resolves pending section placement after the anchor section width is known', () => {
    const anchorNode = makeNode('n-anchor', 'overview-note', 100, 200, 320, 80)
    const detailNode = makeNode('n-detail', 'detail-note', 0, 0, 240, 80)

    const mutableCanvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [anchorNode, detailNode],
      sections: [
        {
          id: 'section-overview',
          title: 'Overview',
          layout: 'horizontal',
          position: { x: 100, y: 200 },
          memberIds: [anchorNode.id],
        },
        {
          id: 'section-details',
          title: 'Details',
          layout: 'horizontal',
          position: { x: 0, y: 0 },
          memberIds: [detailNode.id],
          pendingPlacement: { mode: 'after', anchorSectionTitle: 'Overview' },
        },
      ],
    }

    const canvas = structuredClone(mutableCanvas)
    const anchorLayout = buildSectionLayouts(canvas).get('section-overview')
    const changed = resolvePendingSectionPlacements(mutableCanvas, canvas)

    expect(anchorLayout).toBeDefined()
    const expectedPosition = resolvePendingSectionPosition({
      pendingPlacement: { mode: 'after', anchorSectionTitle: 'Overview' },
      anchorSection: canvas.sections![0],
      anchorLayout: anchorLayout!,
    })

    expect(changed).toBe(true)
    expect(mutableCanvas.sections?.[1]?.position).toEqual(expectedPosition)
    expect(mutableCanvas.sections?.[1]).not.toHaveProperty('pendingPlacement')
  })

  it('pushes sections to the right when a section grows into them', () => {
    const a = makeNode('n-a', 'a', 0, 0, 320, 80)
    const b = makeNode('n-b', 'b', 0, 0, 220, 80)

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [a, b],
      sections: [
        {
          id: 'section-a',
          title: 'Alpha',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [a.id],
        },
        {
          id: 'section-b',
          title: 'Beta',
          layout: 'horizontal',
          position: { x: 360, y: 100 },
          memberIds: [b.id],
        },
      ],
    }

    const updates = resolveSectionCollisionPositions({
      canvas,
      changedSectionIds: ['section-a'],
    })

    expect(updates).toEqual([{ id: 'section-b', position: { x: 456, y: 100 } }])
  })

  it('cascades pushes across multiple neighboring sections', () => {
    const a = makeNode('n-a', 'a', 0, 0, 320, 80)
    const b = makeNode('n-b', 'b', 0, 0, 220, 80)
    const c = makeNode('n-c', 'c', 0, 0, 220, 80)

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [a, b, c],
      sections: [
        {
          id: 'section-a',
          title: 'Alpha',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [a.id],
        },
        {
          id: 'section-b',
          title: 'Beta',
          layout: 'horizontal',
          position: { x: 360, y: 100 },
          memberIds: [b.id],
        },
        {
          id: 'section-c',
          title: 'Gamma',
          layout: 'horizontal',
          position: { x: 620, y: 100 },
          memberIds: [c.id],
        },
      ],
    }

    const updates = resolveSectionCollisionPositions({
      canvas,
      changedSectionIds: ['section-a'],
    })

    expect(updates).toEqual([
      { id: 'section-b', position: { x: 456, y: 100 } },
      { id: 'section-c', position: { x: 770, y: 100 } },
    ])
  })

  it('pushes sections downward when they sit below the changed section', () => {
    const a = makeNode('n-a', 'a', 0, 0, 220, 220)
    const b = makeNode('n-b', 'b', 0, 0, 220, 80)

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [a, b],
      sections: [
        {
          id: 'section-a',
          title: 'Alpha',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [a.id],
        },
        {
          id: 'section-b',
          title: 'Beta',
          layout: 'horizontal',
          position: { x: 100, y: 340 },
          memberIds: [b.id],
        },
      ],
    }

    const updates = resolveSectionCollisionPositions({
      canvas,
      changedSectionIds: ['section-a'],
    })

    expect(updates).toEqual([{ id: 'section-b', position: { x: 100, y: 458.3 } }])
  })

  it('prefers pushing downward when a lower section also sits slightly to the right', () => {
    const a = makeNode('n-a', 'a', 0, 0, 280, 220)
    const b = makeNode('n-b', 'b', 0, 0, 220, 80)

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [a, b],
      sections: [
        {
          id: 'section-a',
          title: 'Alpha',
          layout: 'grid',
          position: { x: 100, y: 100 },
          memberIds: [a.id],
          columns: 2,
        },
        {
          id: 'section-b',
          title: 'Beta',
          layout: 'grid',
          position: { x: 180, y: 340 },
          memberIds: [b.id],
          columns: 2,
        },
      ],
    }

    const updates = resolveSectionCollisionPositions({
      canvas,
      changedSectionIds: ['section-a'],
    })

    expect(updates).toEqual([{ id: 'section-b', position: { x: 180, y: 458.3 } }])
  })

  it('does not move sections when there is no overlap', () => {
    const a = makeNode('n-a', 'a', 0, 0, 220, 80)
    const b = makeNode('n-b', 'b', 0, 0, 220, 80)

    const canvas: CanvasItem = {
      kind: 'canvas',
      id: 'canvas-1',
      name: 'Canvas',
      xynode: { id: 'canvas-1', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
      edges: [],
      items: [a, b],
      sections: [
        {
          id: 'section-a',
          title: 'Alpha',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [a.id],
        },
        {
          id: 'section-b',
          title: 'Beta',
          layout: 'horizontal',
          position: { x: 480, y: 100 },
          memberIds: [b.id],
        },
      ],
    }

    expect(
      resolveSectionCollisionPositions({
        canvas,
        changedSectionIds: ['section-a'],
      })
    ).toEqual([])
  })
})
