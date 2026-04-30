import { describe, expect, it } from 'vitest'
import type { NodeChange } from '@xyflow/react'
import type { CanvasItem, NodeItem, SectionDef } from 'shared'
import { NODE_NAME_HEIGHT } from 'shared/constants'
import { toRect } from '@/components/canvas/canvasLayout'
import { buildSectionLayouts, SECTION_CONTENT_GAP, SECTION_TITLE_HEIGHT } from '@/components/canvas/section/layout'
import { applyNodeChangesToCanvas } from '@/utils/applyChanges'

function expectedImageNodeHeight(width: number): number {
  return Math.round(width / 2) + NODE_NAME_HEIGHT
}

function makeImageNode(): NodeItem {
  const renderedDimensions = { width: 400, height: expectedImageNodeHeight(400) }

  return {
    kind: 'node',
    id: 'image-node',
    name: 'Image',
    xynode: {
      id: 'image-node',
      type: 'image',
      position: { x: 40, y: 80 },
      width: renderedDimensions.width,
      height: renderedDimensions.height,
      measured: { ...renderedDimensions },
      data: {
        storagePath: 'files/workspace/canvas/image.png',
        mimeType: 'image/png',
        size: 1024,
        contentHash: 'hash',
        width: 800,
        height: 400,
      },
    },
  } as NodeItem
}

function makeCanvas(items: NodeItem[], sections?: SectionDef[]): CanvasItem {
  return {
    kind: 'canvas',
    id: 'canvas',
    name: 'Canvas',
    xynode: {
      id: 'canvas',
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
    sections,
  }
}

describe('image node sizing', () => {
  it('persists image resize dimensions through generic React Flow dimensions', () => {
    const imageNode = makeImageNode()
    const canvas = makeCanvas([imageNode])
    const resizedDimensions = { width: 500, height: expectedImageNodeHeight(500) }

    applyNodeChangesToCanvas(
      [
        {
          type: 'dimensions',
          id: imageNode.id,
          dimensions: resizedDimensions,
          resizing: false,
          setAttributes: true,
        },
      ] as NodeChange[],
      canvas
    )

    expect(imageNode.xynode.width).toBe(resizedDimensions.width)
    expect(imageNode.xynode.height).toBe(resizedDimensions.height)
    expect(imageNode.xynode.measured).toEqual(resizedDimensions)
    expect(imageNode.xynode.data).toMatchObject({ width: 800, height: 400 })
  })

  it('uses generic measured dimensions for section layout', () => {
    const imageNode = makeImageNode()
    const canvas = makeCanvas(
      [imageNode],
      [
        {
          id: 'section',
          title: 'Section',
          layout: 'horizontal',
          position: { x: 0, y: 0 },
          memberIds: [imageNode.id],
        },
      ]
    )

    const layout = buildSectionLayouts(canvas).get('section')

    expect(layout?.height).toBe(SECTION_TITLE_HEIGHT + SECTION_CONTENT_GAP + expectedImageNodeHeight(400))
  })

  it('uses generic measured dimensions for canvas layout rects', () => {
    const imageNode = makeImageNode()

    expect(toRect(imageNode)).toEqual({
      id: imageNode.id,
      x: 40,
      y: 80,
      width: 400,
      height: expectedImageNodeHeight(400),
    })
  })
})
