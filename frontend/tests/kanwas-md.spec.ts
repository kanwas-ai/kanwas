import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CanvasItem, NodeItem } from 'shared/path-mapper'
import type { EdgeChange, NodeChange } from '@xyflow/react'
import { applyEdgeChangesToCanvas, applyNodeChangesToCanvas } from '@/utils/applyChanges'
import { DocumentName } from '@/components/canvas/nodes/DocumentName'
import { KANWAS_SYSTEM_NODE_KIND, canvasContainsKanwasSystemNode, isKanwasExplicitlyEdited } from '@/lib/workspaceUtils'

const mocks = vi.hoisted(() => ({
  updateDocumentName: vi.fn(),
  showToast: vi.fn(),
  useState: vi.fn(),
}))

vi.mock('react', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    ...react,
    useState: (...args: unknown[]) => mocks.useState(...args),
  }
})

vi.mock('@/components/canvas/hooks', () => ({
  useUpdateDocumentName: () => mocks.updateDocumentName,
}))

vi.mock('@/utils/toast', () => ({
  showToast: mocks.showToast,
}))

function createNode(id: string, name: string, data: Record<string, unknown> = {}): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
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

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('kanwas protections', () => {
  it('blocks delete changes but allows move changes for the canonical kanwas node', () => {
    const kanwasNode = createNode('kanwas-node', 'Kanwas', { systemNodeKind: KANWAS_SYSTEM_NODE_KIND })
    const movableNode = createNode('movable-node', 'Movable note')
    const removableNode = createNode('removable-node', 'Removable note')
    const canvas = createCanvas('root', 'Workspace', [kanwasNode, movableNode, removableNode])

    const changes = [
      {
        type: 'position',
        id: 'kanwas-node',
        position: { x: 400, y: 200 },
        dragging: true,
      },
      {
        type: 'remove',
        id: 'kanwas-node',
      },
      {
        type: 'position',
        id: 'movable-node',
        position: { x: 140, y: 80 },
        dragging: false,
      },
      {
        type: 'remove',
        id: 'removable-node',
      },
    ] as NodeChange[]

    applyNodeChangesToCanvas(changes, canvas, new Set(['kanwas-node']))

    const protectedNode = canvas.items.find((item) => item.id === 'kanwas-node')
    const movedNode = canvas.items.find((item) => item.id === 'movable-node')
    const deletedNode = canvas.items.find((item) => item.id === 'removable-node')

    expect(protectedNode).toBeDefined()
    expect(protectedNode?.xynode.position).toEqual({ x: 400, y: 200 })

    expect(movedNode).toBeDefined()
    expect(movedNode?.xynode.position).toEqual({ x: 140, y: 80 })

    expect(deletedNode).toBeUndefined()
  })

  it('allows duplicate marker changes when only canonical node is protected', () => {
    const canonicalNode = createNode('kanwas-canonical', 'Kanwas', { systemNodeKind: KANWAS_SYSTEM_NODE_KIND })
    const duplicateNode = createNode('kanwas-duplicate', 'Kanwas duplicate', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
    })
    const canvas = createCanvas('root', 'Workspace', [canonicalNode, duplicateNode])

    const changes = [
      {
        type: 'position',
        id: 'kanwas-canonical',
        position: { x: 100, y: 100 },
        dragging: true,
      },
      {
        type: 'remove',
        id: 'kanwas-canonical',
      },
      {
        type: 'position',
        id: 'kanwas-duplicate',
        position: { x: 220, y: 80 },
        dragging: false,
      },
      {
        type: 'remove',
        id: 'kanwas-duplicate',
      },
    ] as NodeChange[]

    applyNodeChangesToCanvas(changes, canvas, new Set(['kanwas-canonical']))

    const protectedNode = canvas.items.find((item) => item.id === 'kanwas-canonical')
    const duplicate = canvas.items.find((item) => item.id === 'kanwas-duplicate')

    expect(protectedNode).toBeDefined()
    expect(protectedNode?.xynode.position).toEqual({ x: 100, y: 100 })
    expect(duplicate).toBeUndefined()
  })

  it('preserves nested canvas items when ReactFlow changes target a canvas item', () => {
    const nestedNode = createNode('nested-node', 'Nested node')
    const nestedCanvas = createCanvas('nested-canvas', 'Nested Canvas', [nestedNode])
    const canvas = createCanvas('root', 'Workspace', [nestedCanvas])

    const changes = [
      {
        type: 'select',
        id: 'nested-canvas',
        selected: true,
      },
      {
        type: 'position',
        id: 'nested-canvas',
        position: { x: 240, y: 180 },
        dragging: false,
      },
      {
        type: 'dimensions',
        id: 'nested-canvas',
        dimensions: { width: 320, height: 120 },
        resizing: false,
        setAttributes: true,
      },
    ] as NodeChange[]

    applyNodeChangesToCanvas(changes, canvas)

    const updatedCanvas = canvas.items.find(
      (item): item is CanvasItem => item.kind === 'canvas' && item.id === 'nested-canvas'
    )

    expect(updatedCanvas).toBeDefined()
    expect(updatedCanvas?.items).toHaveLength(1)
    expect(updatedCanvas?.items[0]).toBe(nestedNode)
    expect(updatedCanvas?.xynode.selected).toBeUndefined()
    expect(updatedCanvas?.xynode.position).toEqual({ x: 240, y: 180 })
    expect(updatedCanvas?.xynode.measured).toEqual({ width: 320, height: 120 })
    expect(updatedCanvas?.xynode.width).toBe(320)
    expect(updatedCanvas?.xynode.height).toBe(120)
  })

  it('does not persist ReactFlow select changes into canvas nodes or edges', () => {
    const source = createNode('source', 'Source')
    const target = createNode('target', 'Target')
    const canvas = createCanvas('root', 'Workspace', [source, target])
    canvas.edges = [{ id: 'edge-1', source: 'source', target: 'target', selected: false }]

    applyNodeChangesToCanvas(
      [
        {
          type: 'select',
          id: 'source',
          selected: true,
        },
      ] as NodeChange[],
      canvas
    )
    applyEdgeChangesToCanvas(
      [
        {
          type: 'select',
          id: 'edge-1',
          selected: true,
        },
      ] as EdgeChange[],
      canvas
    )

    expect(source.xynode.selected).toBeUndefined()
    expect(canvas.edges[0]?.selected).toBe(false)
  })

  it('detects kanwas markers recursively for canvas delete guards', () => {
    const kanwasNode = createNode('kanwas-node', 'Kanwas', { systemNodeKind: KANWAS_SYSTEM_NODE_KIND })
    const regularCanvas = createCanvas('regular', 'Regular', [createNode('regular-node', 'Doc')])
    const protectedCanvas = createCanvas('protected', 'Protected', [kanwasNode])
    const root = createCanvas('root', 'Workspace', [regularCanvas, protectedCanvas])

    expect(canvasContainsKanwasSystemNode(regularCanvas)).toBe(false)
    expect(canvasContainsKanwasSystemNode(protectedCanvas)).toBe(true)
    expect(canvasContainsKanwasSystemNode(root)).toBe(true)
  })

  it('allows rename attempts by default', () => {
    const setEditing = vi.fn()
    mocks.useState.mockReturnValue([true, setEditing])

    const element = DocumentName({
      nodeId: 'kanwas-node',
      documentName: 'Kanwas',
    })

    const inlineInput = element.props.children as { props: { onSave: (value: string) => void } }
    inlineInput.props.onSave('Renamed Kanwas')

    expect(mocks.showToast).not.toHaveBeenCalled()
    expect(mocks.updateDocumentName).toHaveBeenCalledWith('kanwas-node', 'Renamed Kanwas')
    expect(setEditing).toHaveBeenCalledWith(false)
  })

  it('requires explicitlyEdited=true to treat kanwas as a local edit', () => {
    const localEditNode = createNode('kanwas-local', 'Kanwas', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
      explicitlyEdited: true,
    })
    const remoteOnlyNode = createNode('kanwas-remote', 'Kanwas', {
      systemNodeKind: KANWAS_SYSTEM_NODE_KIND,
    })

    expect(isKanwasExplicitlyEdited(localEditNode)).toBe(true)
    expect(isKanwasExplicitlyEdited(remoteOnlyNode)).toBe(false)
  })
})
