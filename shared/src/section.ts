import type { FileSection, FileSectionPlacement, SectionLayout, SectionRelativePlacement } from './types.js'

const VALID_SECTION_LAYOUTS: SectionLayout[] = ['horizontal', 'grid']

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSectionLayout(value: unknown): value is SectionLayout {
  return typeof value === 'string' && VALID_SECTION_LAYOUTS.includes(value as SectionLayout)
}

function parseRelativePlacement(value: unknown): SectionRelativePlacement | null {
  if (!isObjectRecord(value) || typeof value.anchorSectionTitle !== 'string') {
    return null
  }

  const anchorSectionTitle = value.anchorSectionTitle.trim()
  if (anchorSectionTitle.length === 0) {
    return null
  }

  if (value.mode !== 'after' && value.mode !== 'below') {
    return null
  }

  if (value.gap !== undefined && (typeof value.gap !== 'number' || !Number.isFinite(value.gap) || value.gap < 0)) {
    return null
  }

  return {
    mode: value.mode,
    anchorSectionTitle,
    ...(value.gap !== undefined ? { gap: value.gap } : {}),
  }
}

function parseFileAnchorPlacement(value: unknown): FileSectionPlacement | null {
  if (!isObjectRecord(value) || value.mode !== 'with_file' || typeof value.anchorFilePath !== 'string') {
    return null
  }

  const anchorFilePath = value.anchorFilePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
  if (
    anchorFilePath.length === 0 ||
    anchorFilePath.startsWith('/') ||
    anchorFilePath.includes('\0') ||
    anchorFilePath.split('/').some((segment) => segment === '..')
  ) {
    return null
  }

  return {
    mode: 'with_file',
    anchorFilePath,
  }
}

function parsePlacement(value: unknown): FileSectionPlacement | null {
  return parseRelativePlacement(value) ?? parseFileAnchorPlacement(value)
}

export function parseFileSection(value: unknown): FileSection | null {
  if (!isObjectRecord(value) || typeof value.mode !== 'string' || typeof value.title !== 'string') {
    return null
  }

  const title = value.title.trim()
  if (title.length === 0) {
    return null
  }

  switch (value.mode) {
    case 'create':
      const columns = value.columns
      const placement = parsePlacement(value.placement)
      if (
        !isSectionLayout(value.layout) ||
        !(
          (typeof value.x === 'number' &&
            Number.isFinite(value.x) &&
            typeof value.y === 'number' &&
            Number.isFinite(value.y)) ||
          placement !== null
        ) ||
        (columns !== undefined && (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1))
      ) {
        return null
      }

      if (placement) {
        return {
          mode: 'create',
          title,
          layout: value.layout,
          placement,
          ...(columns !== undefined ? { columns } : {}),
        }
      }

      return {
        mode: 'create',
        title,
        layout: value.layout,
        x: value.x as number,
        y: value.y as number,
        ...(columns !== undefined ? { columns } : {}),
      }

    case 'join':
      return {
        mode: 'join',
        title,
      }

    default:
      return null
  }
}

export function isFileSection(value: unknown): value is FileSection {
  return parseFileSection(value) !== null
}
