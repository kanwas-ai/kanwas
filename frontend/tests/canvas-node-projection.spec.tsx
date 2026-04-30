import React, { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import type { CanvasItem, GroupDef, NodeItem, SectionDef } from 'shared'
import { useCanvasNodeProjection } from '@/components/canvas/useCanvasNodeProjection'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type ProjectedNode = {
  id: string
  type?: string
  selected?: boolean
  width?: number
  height?: number
  measured?: { width?: number; height?: number }
  style?: { width?: number; height?: number }
}

function createNode(id: string, name: string, selected?: boolean, measured = { width: 320, height: 120 }): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      selected,
      position: { x: 0, y: 0 },
      measured,
      data: {},
    } as NodeItem['xynode'],
  }
}

function createCanvas(items: NodeItem[], sections?: SectionDef[], groups?: GroupDef[]): CanvasItem {
  return {
    kind: 'canvas',
    id: 'root',
    name: 'Root',
    xynode: {
      id: 'root',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
    sections,
    groups,
  }
}

const noop = () => {}

function ProjectionProbe({
  canvas,
  selectedNodeIds,
  groupGrids = new Map(),
  onProjected,
}: {
  canvas: CanvasItem
  selectedNodeIds: string[]
  groupGrids?: Map<string, { width: number; height: number; cellPositions: { x: number; y: number }[] }>
  onProjected: (nodes: ProjectedNode[]) => void
}) {
  const draggingNodeIdsRef = useRef(new Set<string>())
  const nodes = useCanvasNodeProjection({
    canvas,
    groupedIds: new Set(),
    groupGrids,
    draggingNodeIdsRef,
    joinTargetGroupId: null,
    joinTargetSectionId: null,
    toolbarHoverSectionId: null,
    onFocusNode: noop,
    onSelectNode: noop,
    onDeselectNode: noop,
    onExpandNode: noop,
    onCollapseNode: noop,
    handleGroupColorChange: noop,
    handleGroupColumnsChange: noop,
    handleGroupDrag: noop,
    handleGroupNameChange: noop,
    handleSectionTitleChange: noop,
    handleSectionLayoutChange: noop,
    handleSectionColumnsChange: noop,
    handleSectionDrag: noop,
    handleSectionDragStart: noop,
    handleSectionDragEnd: noop,
    handleDeleteSection: noop,
    canonicalKanwasNodeId: null,
    selectedNodeIds,
  })

  onProjected(nodes as ProjectedNode[])
  return null
}

describe('canvas node projection', () => {
  it('derives visual selection from local selected node ids', () => {
    const canvas = createCanvas([createNode('node-a', 'A', true), createNode('node-b', 'B')])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let projected: ProjectedNode[] = []

    try {
      act(() => {
        root.render(
          <ProjectionProbe canvas={canvas} selectedNodeIds={[]} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      expect(projected.find((node) => node.id === 'node-a')?.selected).toBe(false)
      expect(projected.find((node) => node.id === 'node-b')?.selected).toBe(false)

      act(() => {
        root.render(
          <ProjectionProbe canvas={canvas} selectedNodeIds={['node-b']} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      expect(projected.find((node) => node.id === 'node-a')?.selected).toBe(false)
      expect(projected.find((node) => node.id === 'node-b')?.selected).toBe(true)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('keeps synthetic section and group background identity across unrelated parent renders', () => {
    const canvas = createCanvas(
      [createNode('node-a', 'A')],
      [
        {
          id: 'section-a',
          title: 'Section A',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: ['node-a'],
        },
      ],
      [
        {
          id: 'group-a',
          name: 'Group A',
          position: { x: 500, y: 100 },
          memberIds: [],
        },
      ]
    )
    const groupGrids = new Map([['group-a', { width: 120, height: 80, cellPositions: [] }]])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let projected: ProjectedNode[] = []

    try {
      act(() => {
        root.render(
          <ProjectionProbe
            canvas={canvas}
            selectedNodeIds={[]}
            groupGrids={groupGrids}
            onProjected={(nodes) => (projected = nodes)}
          />
        )
      })

      const sectionBefore = projected.find((node) => node.id === 'section-a')
      const groupBefore = projected.find((node) => node.id === 'group-a')

      act(() => {
        root.render(
          <ProjectionProbe
            canvas={canvas}
            selectedNodeIds={[]}
            groupGrids={groupGrids}
            onProjected={(nodes) => (projected = nodes)}
          />
        )
      })

      expect(projected.find((node) => node.id === 'section-a')).toBe(sectionBefore)
      expect(projected.find((node) => node.id === 'group-a')).toBe(groupBefore)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('projects synthetic backgrounds with React Flow dimensions so they do not hide while remeasuring', () => {
    const canvas = createCanvas(
      [createNode('node-a', 'A')],
      [
        {
          id: 'section-a',
          title: 'Section A',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: ['node-a'],
        },
      ],
      [
        {
          id: 'group-a',
          name: 'Group A',
          position: { x: 500, y: 100 },
          memberIds: [],
        },
      ]
    )
    const groupGrids = new Map([['group-a', { width: 120, height: 80, cellPositions: [] }]])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let projected: ProjectedNode[] = []

    try {
      act(() => {
        root.render(
          <ProjectionProbe
            canvas={canvas}
            selectedNodeIds={[]}
            groupGrids={groupGrids}
            onProjected={(nodes) => (projected = nodes)}
          />
        )
      })

      const sectionBackground = projected.find((node) => node.id === 'section-a')
      const groupBackground = projected.find((node) => node.id === 'group-a')

      expect(sectionBackground?.width).toBe(sectionBackground?.style?.width)
      expect(sectionBackground?.height).toBe(sectionBackground?.style?.height)
      expect(sectionBackground?.measured).toEqual(sectionBackground?.style)
      expect(groupBackground?.width).toBe(120)
      expect(groupBackground?.height).toBe(80)
      expect(groupBackground?.measured).toEqual({ width: 120, height: 80 })
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('keeps unrelated projected nodes stable when selection changes', () => {
    const canvas = createCanvas([createNode('node-a', 'A'), createNode('node-b', 'B')])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let projected: ProjectedNode[] = []

    try {
      act(() => {
        root.render(
          <ProjectionProbe canvas={canvas} selectedNodeIds={[]} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      const nodeABefore = projected.find((node) => node.id === 'node-a')
      const nodeBBefore = projected.find((node) => node.id === 'node-b')

      act(() => {
        root.render(
          <ProjectionProbe canvas={canvas} selectedNodeIds={['node-b']} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      expect(projected.find((node) => node.id === 'node-a')).toBe(nodeABefore)
      expect(projected.find((node) => node.id === 'node-b')).not.toBe(nodeBBefore)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('only replaces the section background whose member dimensions changed', () => {
    const canvas = createCanvas(
      [createNode('node-a', 'A', false, { width: 320, height: 120 }), createNode('node-b', 'B')],
      [
        {
          id: 'section-a',
          title: 'Section A',
          layout: 'horizontal',
          position: { x: 100, y: 100 },
          memberIds: ['node-a'],
        },
        {
          id: 'section-b',
          title: 'Section B',
          layout: 'horizontal',
          position: { x: 600, y: 100 },
          memberIds: ['node-b'],
        },
      ]
    )
    const nextCanvas = structuredClone(canvas)
    const resizedNode = nextCanvas.items.find((item) => item.id === 'node-a')
    if (resizedNode) {
      resizedNode.xynode.measured = { width: 320, height: 220 }
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let projected: ProjectedNode[] = []

    try {
      act(() => {
        root.render(
          <ProjectionProbe canvas={canvas} selectedNodeIds={[]} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      const sectionABefore = projected.find((node) => node.id === 'section-a')
      const sectionBBefore = projected.find((node) => node.id === 'section-b')

      act(() => {
        root.render(
          <ProjectionProbe canvas={nextCanvas} selectedNodeIds={[]} onProjected={(nodes) => (projected = nodes)} />
        )
      })

      expect(projected.find((node) => node.id === 'section-a')).not.toBe(sectionABefore)
      expect(projected.find((node) => node.id === 'section-b')).toBe(sectionBBefore)
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })
})
