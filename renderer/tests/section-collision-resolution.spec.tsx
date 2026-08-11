import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { CanvasItem, NodeItem, SectionDef } from 'shared'
import { useSectionCollisionResolution } from '@/components/canvas/section/useSectionCollisionResolution'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeNode(id: string, width: number, height = 80): NodeItem {
  return {
    kind: 'node',
    id,
    name: id,
    xynode: {
      id,
      type: 'text',
      position: { x: 0, y: 0 },
      measured: { width, height },
      data: { content: id },
    },
  } as NodeItem
}

function makeSection(id: string, x: number, memberIds: string[]): SectionDef {
  return {
    id,
    title: id.replace('section-', '').toUpperCase(),
    layout: 'horizontal',
    position: { x, y: 100 },
    memberIds,
  }
}

function makeCanvas(items: NodeItem[], sections: SectionDef[]): CanvasItem {
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

function cloneCanvas(canvas: CanvasItem): CanvasItem {
  return structuredClone(canvas)
}

function getSection(canvas: CanvasItem, sectionId: string): SectionDef {
  const section = canvas.sections?.find((candidate) => candidate.id === sectionId)
  if (!section) {
    throw new Error(`Missing section: ${sectionId}`)
  }
  return section
}

function CollisionProbe({ canvas, mutableCanvas }: { canvas: CanvasItem; mutableCanvas: CanvasItem }) {
  useSectionCollisionResolution({
    canvas,
    mutableCanvas,
    isSectionDragging: false,
  })

  return null
}

function renderCollisionProbe(root: Root, canvas: CanvasItem, mutableCanvas: CanvasItem) {
  act(() => {
    root.render(<CollisionProbe canvas={canvas} mutableCanvas={mutableCanvas} />)
  })
}

describe('section collision resolution', () => {
  it('pushes neighboring sections when external membership changes grow a section', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      const initialCanvas = makeCanvas(
        [makeNode('node-a', 320), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a']), makeSection('section-b', 360, ['node-b'])]
      )
      renderCollisionProbe(root, initialCanvas, cloneCanvas(initialCanvas))

      const nextCanvas = makeCanvas(
        [makeNode('node-a', 320), makeNode('node-new', 220), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a', 'node-new']), makeSection('section-b', 360, ['node-b'])]
      )
      const mutableNextCanvas = cloneCanvas(nextCanvas)

      renderCollisionProbe(root, nextCanvas, mutableNextCanvas)

      expect(getSection(mutableNextCanvas, 'section-b').position.x).toBeGreaterThan(360)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('does not run collision resolution for inactive measurement-only growth', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      const initialCanvas = makeCanvas(
        [makeNode('node-a', 100), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a']), makeSection('section-b', 480, ['node-b'])]
      )
      renderCollisionProbe(root, initialCanvas, cloneCanvas(initialCanvas))

      const nextCanvas = makeCanvas(
        [makeNode('node-a', 560), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a']), makeSection('section-b', 480, ['node-b'])]
      )
      const mutableNextCanvas = cloneCanvas(nextCanvas)

      renderCollisionProbe(root, nextCanvas, mutableNextCanvas)

      expect(getSection(mutableNextCanvas, 'section-b').position.x).toBe(480)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('keeps externally changed sections active for follow-up measurement growth', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      const initialCanvas = makeCanvas(
        [makeNode('node-a', 100), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a']), makeSection('section-b', 450, ['node-b'])]
      )
      renderCollisionProbe(root, initialCanvas, cloneCanvas(initialCanvas))

      const membershipCanvas = makeCanvas(
        [makeNode('node-a', 100), makeNode('node-new', 100), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a', 'node-new']), makeSection('section-b', 450, ['node-b'])]
      )
      const mutableMembershipCanvas = cloneCanvas(membershipCanvas)
      renderCollisionProbe(root, membershipCanvas, mutableMembershipCanvas)
      expect(getSection(mutableMembershipCanvas, 'section-b').position.x).toBe(450)

      const measuredCanvas = makeCanvas(
        [makeNode('node-a', 100), makeNode('node-new', 260), makeNode('node-b', 220)],
        [makeSection('section-a', 100, ['node-a', 'node-new']), makeSection('section-b', 450, ['node-b'])]
      )
      const mutableMeasuredCanvas = cloneCanvas(measuredCanvas)

      renderCollisionProbe(root, measuredCanvas, mutableMeasuredCanvas)

      expect(getSection(mutableMeasuredCanvas, 'section-b').position.x).toBeGreaterThan(450)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })
})
