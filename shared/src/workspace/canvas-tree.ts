import type { CanvasItem, NodeItem } from '../types.js'

export type CanvasTreeValidationReason =
  | 'canvas_not_object'
  | 'canvas_kind_invalid'
  | 'canvas_items_not_array'
  | 'canvas_item_not_object'
  | 'canvas_groups_not_array'
  | 'canvas_group_not_object'
  | 'canvas_group_member_ids_not_array'
  | 'canvas_sections_not_array'
  | 'canvas_section_not_object'
  | 'canvas_section_member_ids_not_array'

export interface CanvasTreeValidationSummary {
  hasItems?: boolean
  id?: string
  itemCount?: number
  itemsType?: string
  keys?: string[]
  kind?: string
  memberIdsType?: string
  name?: string
  valueType: string
}

export class CanvasTreeValidationError extends Error {
  readonly path: string
  readonly pathSegments: string[]
  readonly reason: CanvasTreeValidationReason
  readonly offendingSummary: CanvasTreeValidationSummary

  constructor(options: {
    pathSegments: string[]
    reason: CanvasTreeValidationReason
    detail: string
    offendingValue: unknown
  }) {
    const path = describePath(options.pathSegments)
    super(`Invalid canvas tree at ${path}: ${options.detail}`)
    this.name = 'CanvasTreeValidationError'
    this.path = path
    this.pathSegments = [...options.pathSegments]
    this.reason = options.reason
    this.offendingSummary = summarizeValidationValue(options.offendingValue)
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeJsonValue(value: unknown): unknown {
  if (isObjectRecord(value) && typeof value.toJSON === 'function') {
    return value.toJSON()
  }

  return value
}

function describePath(path: string[]): string {
  return path.length === 0 ? 'root' : path.join(' > ')
}

function describeValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array'
  }

  if (value === null) {
    return 'null'
  }

  return typeof value
}

function summarizeValidationValue(value: unknown): CanvasTreeValidationSummary {
  const normalized = normalizeJsonValue(value)

  if (!isObjectRecord(normalized)) {
    return {
      valueType: describeValueType(normalized),
    }
  }

  const kind = typeof normalized.kind === 'string' ? normalized.kind : undefined
  const id = typeof normalized.id === 'string' ? normalized.id : undefined
  const name = typeof normalized.name === 'string' ? normalized.name : undefined
  const items = normalizeJsonValue(normalized.items)
  const memberIds = normalizeJsonValue(normalized.memberIds)

  return {
    hasItems: Object.hasOwn(normalized, 'items'),
    id,
    itemCount: Array.isArray(items) ? items.length : undefined,
    itemsType: describeValueType(items),
    keys: Object.keys(normalized).sort(),
    kind,
    memberIdsType: describeValueType(memberIds),
    name,
    valueType: 'object',
  }
}

function createValidationError(
  pathSegments: string[],
  reason: CanvasTreeValidationReason,
  detail: string,
  offendingValue: unknown
): CanvasTreeValidationError {
  return new CanvasTreeValidationError({
    detail,
    offendingValue,
    pathSegments,
    reason,
  })
}

function assertCanvasItemsArray(
  value: unknown,
  path: string[],
  parentCanvas: unknown
): asserts value is Array<CanvasItem | NodeItem> {
  if (!Array.isArray(value)) {
    throw createValidationError(path, 'canvas_items_not_array', 'canvas.items must be an array', parentCanvas)
  }
}

function assertCanvasGroups(root: Record<string, unknown>, path: string[]): void {
  const groups = normalizeJsonValue(root.groups)

  if (groups === undefined) {
    return
  }

  if (!Array.isArray(groups)) {
    throw createValidationError(path, 'canvas_groups_not_array', 'canvas.groups must be an array', root)
  }

  groups.forEach((group, index) => {
    const groupPath = [...path, `groups[${index}]`]
    const normalizedGroup = normalizeJsonValue(group)

    if (!isObjectRecord(normalizedGroup)) {
      throw createValidationError(groupPath, 'canvas_group_not_object', 'canvas groups must be objects', group)
    }

    const memberIds = normalizeJsonValue(normalizedGroup.memberIds)
    if (!Array.isArray(memberIds)) {
      throw createValidationError(
        groupPath,
        'canvas_group_member_ids_not_array',
        'group.memberIds must be an array',
        normalizedGroup
      )
    }
  })
}

function assertCanvasSections(root: Record<string, unknown>, path: string[]): void {
  const sections = normalizeJsonValue(root.sections)

  if (sections === undefined) {
    return
  }

  if (!Array.isArray(sections)) {
    throw createValidationError(path, 'canvas_sections_not_array', 'canvas.sections must be an array', root)
  }

  sections.forEach((section, index) => {
    const sectionPath = [...path, `sections[${index}]`]
    const normalizedSection = normalizeJsonValue(section)

    if (!isObjectRecord(normalizedSection)) {
      throw createValidationError(sectionPath, 'canvas_section_not_object', 'canvas sections must be objects', section)
    }

    const memberIds = normalizeJsonValue(normalizedSection.memberIds)
    if (!Array.isArray(memberIds)) {
      throw createValidationError(
        sectionPath,
        'canvas_section_member_ids_not_array',
        'section.memberIds must be an array',
        normalizedSection
      )
    }
  })
}

export function assertValidCanvasTree(root: unknown, path: string[] = ['root']): asserts root is CanvasItem {
  root = normalizeJsonValue(root)

  if (!isObjectRecord(root)) {
    throw createValidationError(path, 'canvas_not_object', 'canvas must be an object', root)
  }

  if (root.kind !== 'canvas') {
    throw createValidationError(path, 'canvas_kind_invalid', "item.kind must be 'canvas'", root)
  }

  const items = normalizeJsonValue(root.items)
  assertCanvasItemsArray(items, path, root)
  assertCanvasGroups(root, path)
  assertCanvasSections(root, path)

  for (const item of items) {
    if (!isObjectRecord(item)) {
      throw createValidationError(path, 'canvas_item_not_object', 'canvas items must be objects', item)
    }

    if (item.kind === 'canvas') {
      const nextPath = typeof item.name === 'string' && item.name.length > 0 ? [...path, item.name] : [...path, item.id]
      assertValidCanvasTree(item, nextPath)
    }
  }
}

export function assertValidWorkspaceRoot(root: unknown): asserts root is CanvasItem | undefined {
  if (root === undefined) {
    return
  }

  assertValidCanvasTree(root)
}
