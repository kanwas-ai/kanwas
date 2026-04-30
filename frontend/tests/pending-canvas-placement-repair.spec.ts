import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem, PendingCanvasPlacement, SectionDef } from 'shared'
import { NODE_LAYOUT } from 'shared/constants'
import {
  resolvePendingCanvasPlacements,
  resolvePendingPlacementRepairs,
} from '@/components/canvas/usePendingCanvasPlacementRepair'
import { buildSectionLayouts, getSectionBounds } from '@/components/canvas/section/layout'

const pendingPlacement: PendingCanvasPlacement = { source: 'filesystem', reason: 'created' }

function makeNode({
  id,
  x,
  y,
  width,
  height,
  pending = false,
}: {
  id: string
  x: number
  y: number
  width: number
  height: number
  pending?: boolean
}): NodeItem {
  return {
    kind: 'node',
    id,
    name: id,
    xynode: {
      id,
      type: 'text',
      position: { x, y },
      measured: { width, height },
      data: {
        content: id,
        ...(pending ? { pendingCanvasPlacement: pendingPlacement } : {}),
      },
    },
  } as NodeItem
}

function makeCanvas(items: NodeItem[], sections?: SectionDef[]): CanvasItem {
  return {
    kind: 'canvas',
    id: 'canvas',
    name: 'Canvas',
    xynode: { id: 'canvas', type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items,
    sections,
  }
}

describe('pending canvas placement repair', () => {
  it('places one pending unsectioned node to the right of the rightmost loose node', () => {
    const existing = makeNode({ id: 'existing', x: 100, y: 200, width: 320, height: 80 })
    const pending = makeNode({ id: 'pending', x: 0, y: 0, width: 220, height: 80, pending: true })
    const mutableCanvas = makeCanvas([existing, pending])
    const canvas = structuredClone(mutableCanvas)

    expect(resolvePendingCanvasPlacements(mutableCanvas, canvas)).toBe(true)

    expect(pending.xynode.position).toEqual({ x: 480, y: 200 })
    expect(pending.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })

  it('places pending nodes to the right of a section when the section is rightmost', () => {
    const sectionMember = makeNode({ id: 'section-member', x: 0, y: 0, width: 240, height: 90 })
    const pending = makeNode({ id: 'pending', x: 0, y: 0, width: 220, height: 80, pending: true })
    const sections: SectionDef[] = [
      {
        id: 'section-a',
        title: 'Section A',
        layout: 'horizontal',
        position: { x: 500, y: 300 },
        memberIds: [sectionMember.id],
      },
    ]
    const mutableCanvas = makeCanvas([sectionMember, pending], sections)
    const canvas = structuredClone(mutableCanvas)
    const sectionBounds = getSectionBounds(canvas.sections![0], buildSectionLayouts(canvas).get('section-a'))!

    expect(resolvePendingCanvasPlacements(mutableCanvas, canvas)).toBe(true)

    expect(pending.xynode.position).toEqual({
      x: sectionBounds.right + NODE_LAYOUT.GAP,
      y: sectionBounds.top,
    })
    expect(pending.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })

  it('places multiple pending nodes as a non-overlapping horizontal batch', () => {
    const existing = makeNode({ id: 'existing', x: 100, y: 120, width: 100, height: 80 })
    const first = makeNode({ id: 'first', x: 0, y: 0, width: 200, height: 80, pending: true })
    const second = makeNode({ id: 'second', x: 0, y: 0, width: 50, height: 80, pending: true })
    const mutableCanvas = makeCanvas([existing, first, second])
    const canvas = structuredClone(mutableCanvas)

    expect(resolvePendingCanvasPlacements(mutableCanvas, canvas)).toBe(true)

    expect(first.xynode.position).toEqual({ x: 260, y: 120 })
    expect(second.xynode.position).toEqual({ x: 520, y: 120 })
    expect(first.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
    expect(second.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })

  it('clears pending markers without moving section-managed nodes', () => {
    const sectioned = makeNode({ id: 'sectioned', x: 0, y: 0, width: 220, height: 80, pending: true })
    const mutableCanvas = makeCanvas(
      [sectioned],
      [
        {
          id: 'section-a',
          title: 'Section A',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: [sectioned.id],
        },
      ]
    )
    const canvas = structuredClone(mutableCanvas)

    expect(resolvePendingCanvasPlacements(mutableCanvas, canvas)).toBe(true)

    expect(sectioned.xynode.position).toEqual({ x: 0, y: 0 })
    expect(sectioned.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })

  it('does not move unmarked nodes at the default origin', () => {
    const existing = makeNode({ id: 'existing', x: 100, y: 120, width: 100, height: 80 })
    const unmarked = makeNode({ id: 'unmarked', x: 0, y: 0, width: 220, height: 80 })
    const mutableCanvas = makeCanvas([existing, unmarked])
    const canvas = structuredClone(mutableCanvas)

    expect(resolvePendingCanvasPlacements(mutableCanvas, canvas)).toBe(false)
    expect(unmarked.xynode.position).toEqual({ x: 0, y: 0 })
  })

  it('uses section positions resolved in the same repair pass', () => {
    const anchorMember = makeNode({ id: 'anchor-member', x: 0, y: 0, width: 320, height: 80 })
    const pendingSectionMember = makeNode({ id: 'pending-section-member', x: 0, y: 0, width: 240, height: 80 })
    const pending = makeNode({ id: 'pending', x: 0, y: 0, width: 220, height: 80, pending: true })
    const sections: SectionDef[] = [
      {
        id: 'section-anchor',
        title: 'Overview',
        layout: 'horizontal',
        position: { x: 100, y: 120 },
        memberIds: [anchorMember.id],
      },
      {
        id: 'section-pending',
        title: 'Details',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: [pendingSectionMember.id],
        pendingPlacement: { mode: 'after', anchorSectionTitle: 'Overview', gap: 96 },
      },
    ]
    const mutableCanvas = makeCanvas([anchorMember, pendingSectionMember, pending], sections)
    const canvas = structuredClone(mutableCanvas)

    expect(resolvePendingPlacementRepairs(mutableCanvas, canvas)).toBe(true)

    const pendingSectionBounds = getSectionBounds(
      mutableCanvas.sections![1],
      buildSectionLayouts(mutableCanvas).get('section-pending')
    )!
    expect(mutableCanvas.sections![1].position).not.toEqual({ x: 0, y: 0 })
    expect(pending.xynode.position).toEqual({
      x: pendingSectionBounds.right + NODE_LAYOUT.GAP,
      y: pendingSectionBounds.top,
    })
    expect(pending.xynode.data).not.toHaveProperty('pendingCanvasPlacement')
  })
})
