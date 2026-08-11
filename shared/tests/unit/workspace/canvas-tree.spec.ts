import { describe, expect, it } from 'vitest'
import {
  CanvasTreeValidationError,
  assertValidCanvasTree,
  assertValidWorkspaceRoot,
} from '../../../src/workspace/canvas-tree.js'

function createCanvas(id: string, name: string, items: unknown[] = []): Record<string, unknown> {
  return {
    id,
    name,
    kind: 'canvas',
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

function expectCanvasTreeValidationError(
  root: unknown,
  expected: {
    message: string
    path: string
    pathSegments: string[]
    reason: string
    offendingSummary?: Record<string, unknown>
  }
): void {
  try {
    assertValidCanvasTree(root)
    throw new Error('Expected canvas tree validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(CanvasTreeValidationError)
    expect((error as CanvasTreeValidationError).message).toBe(expected.message)
    expect(error).toMatchObject({
      offendingSummary: expected.offendingSummary,
      path: expected.path,
      pathSegments: expected.pathSegments,
      reason: expected.reason,
    })
  }
}

describe('canvas-tree invariants', () => {
  it('accepts valid nested canvas trees', () => {
    const root = createCanvas('root', '', [createCanvas('projects', 'projects', [createCanvas('nested', 'nested')])])

    expect(() => assertValidCanvasTree(root)).not.toThrow()
  })

  it('accepts valid section and group member references', () => {
    const root = createCanvas('root', '')
    root.groups = [
      {
        id: 'group-1',
        name: 'Group',
        position: { x: 0, y: 0 },
        memberIds: ['node-1'],
      },
    ]
    root.sections = [
      {
        id: 'section-1',
        title: 'Section',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: ['node-1'],
      },
    ]

    expect(() => assertValidCanvasTree(root)).not.toThrow()
  })

  it('rejects nested canvases without items arrays', () => {
    const root = createCanvas('root', '', [
      {
        id: 'projects',
        name: 'projects',
        kind: 'canvas',
        xynode: {
          id: 'projects',
          type: 'canvas',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
        edges: [],
      },
    ])

    try {
      assertValidCanvasTree(root)
      throw new Error('Expected canvas tree validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CanvasTreeValidationError)
      expect((error as CanvasTreeValidationError).message).toBe(
        'Invalid canvas tree at root > projects: canvas.items must be an array'
      )
      expect(error).toMatchObject({
        offendingSummary: {
          hasItems: false,
          id: 'projects',
          itemsType: 'undefined',
          kind: 'canvas',
          name: 'projects',
          valueType: 'object',
        },
        path: 'root > projects',
        pathSegments: ['root', 'projects'],
        reason: 'canvas_items_not_array',
      })
    }
  })

  it('rejects sections without memberIds arrays', () => {
    const root = createCanvas('root', '')
    root.sections = [
      {
        id: 'section-1',
        title: 'Section',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
      },
    ]

    expectCanvasTreeValidationError(root, {
      message: 'Invalid canvas tree at root > sections[0]: section.memberIds must be an array',
      offendingSummary: {
        id: 'section-1',
        keys: ['id', 'layout', 'position', 'title'],
        memberIdsType: 'undefined',
        valueType: 'object',
      },
      path: 'root > sections[0]',
      pathSegments: ['root', 'sections[0]'],
      reason: 'canvas_section_member_ids_not_array',
    })
  })

  it('rejects sections with non-array memberIds', () => {
    const root = createCanvas('root', '')
    root.sections = [
      {
        id: 'section-1',
        title: 'Section',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: 'node-1',
      },
    ]

    expectCanvasTreeValidationError(root, {
      message: 'Invalid canvas tree at root > sections[0]: section.memberIds must be an array',
      offendingSummary: {
        id: 'section-1',
        keys: ['id', 'layout', 'memberIds', 'position', 'title'],
        memberIdsType: 'string',
        valueType: 'object',
      },
      path: 'root > sections[0]',
      pathSegments: ['root', 'sections[0]'],
      reason: 'canvas_section_member_ids_not_array',
    })
  })

  it('rejects groups without memberIds arrays', () => {
    const root = createCanvas('root', '')
    root.groups = [
      {
        id: 'group-1',
        name: 'Group',
        position: { x: 0, y: 0 },
      },
    ]

    expectCanvasTreeValidationError(root, {
      message: 'Invalid canvas tree at root > groups[0]: group.memberIds must be an array',
      offendingSummary: {
        id: 'group-1',
        keys: ['id', 'name', 'position'],
        memberIdsType: 'undefined',
        name: 'Group',
        valueType: 'object',
      },
      path: 'root > groups[0]',
      pathSegments: ['root', 'groups[0]'],
      reason: 'canvas_group_member_ids_not_array',
    })
  })

  it('rejects groups with non-array memberIds', () => {
    const root = createCanvas('root', '')
    root.groups = [
      {
        id: 'group-1',
        name: 'Group',
        position: { x: 0, y: 0 },
        memberIds: 'node-1',
      },
    ]

    expectCanvasTreeValidationError(root, {
      message: 'Invalid canvas tree at root > groups[0]: group.memberIds must be an array',
      offendingSummary: {
        id: 'group-1',
        keys: ['id', 'memberIds', 'name', 'position'],
        memberIdsType: 'string',
        name: 'Group',
        valueType: 'object',
      },
      path: 'root > groups[0]',
      pathSegments: ['root', 'groups[0]'],
      reason: 'canvas_group_member_ids_not_array',
    })
  })

  it('rejects malformed sections and groups containers', () => {
    const rootWithSections = createCanvas('root', '')
    rootWithSections.sections = { id: 'section-1' }

    expectCanvasTreeValidationError(rootWithSections, {
      message: 'Invalid canvas tree at root: canvas.sections must be an array',
      offendingSummary: {
        id: 'root',
        keys: ['edges', 'id', 'items', 'kind', 'name', 'sections', 'xynode'],
        kind: 'canvas',
        name: '',
        valueType: 'object',
      },
      path: 'root',
      pathSegments: ['root'],
      reason: 'canvas_sections_not_array',
    })

    const rootWithGroups = createCanvas('root', '')
    rootWithGroups.groups = { id: 'group-1' }

    expectCanvasTreeValidationError(rootWithGroups, {
      message: 'Invalid canvas tree at root: canvas.groups must be an array',
      offendingSummary: {
        id: 'root',
        keys: ['edges', 'groups', 'id', 'items', 'kind', 'name', 'xynode'],
        kind: 'canvas',
        name: '',
        valueType: 'object',
      },
      path: 'root',
      pathSegments: ['root'],
      reason: 'canvas_groups_not_array',
    })
  })

  it('rejects non-object section and group entries', () => {
    const rootWithSections = createCanvas('root', '')
    rootWithSections.sections = ['section-1']

    expectCanvasTreeValidationError(rootWithSections, {
      message: 'Invalid canvas tree at root > sections[0]: canvas sections must be objects',
      offendingSummary: {
        valueType: 'string',
      },
      path: 'root > sections[0]',
      pathSegments: ['root', 'sections[0]'],
      reason: 'canvas_section_not_object',
    })

    const rootWithGroups = createCanvas('root', '')
    rootWithGroups.groups = ['group-1']

    expectCanvasTreeValidationError(rootWithGroups, {
      message: 'Invalid canvas tree at root > groups[0]: canvas groups must be objects',
      offendingSummary: {
        valueType: 'string',
      },
      path: 'root > groups[0]',
      pathSegments: ['root', 'groups[0]'],
      reason: 'canvas_group_not_object',
    })
  })

  it('allows missing workspace root for empty documents', () => {
    expect(() => assertValidWorkspaceRoot(undefined)).not.toThrow()
  })
})
