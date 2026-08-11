import type { CanvasItem, NodeItem } from 'shared'

type CanvasSibling = CanvasItem | NodeItem

type NameTarget =
  | { kind: 'canvas' }
  | {
      kind: 'node'
      type: NodeItem['xynode']['type']
      originalFilename?: string
      mimeType?: string
    }

function getFilenameExtension(filename?: string): string {
  if (!filename) return ''
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0) return ''
  return filename.slice(lastDot)
}

function getImageExtensionFromMimeType(mimeType?: string): string {
  if (!mimeType) return ''
  const subtype = mimeType.split('/')[1]
  if (!subtype) return ''
  if (subtype === 'jpeg') return '.jpg'
  return `.${subtype}`
}

function getNodeDisplayExtension(target: Extract<NameTarget, { kind: 'node' }>): string {
  if (target.type === 'image') {
    return getImageExtensionFromMimeType(target.mimeType)
  }

  if (target.type === 'file' || target.type === 'audio') {
    return getFilenameExtension(target.originalFilename)
  }

  if (target.type === 'blockNote') {
    return '.md'
  }

  return ''
}

function normalizeForComparison(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function normalizeEditableName(name: string, target: NameTarget): string {
  const trimmed = name.trim()
  if (target.kind !== 'node') return trimmed

  const extension = getNodeDisplayExtension(target)
  if (!extension) return trimmed

  if (!trimmed.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())) {
    return trimmed
  }

  const withoutExtension = trimmed.slice(0, -extension.length).trimEnd()
  return withoutExtension || trimmed
}

export function getCanvasItemDisplayName(item: CanvasSibling): string {
  if (item.kind === 'canvas') {
    return item.name
  }

  const target: Extract<NameTarget, { kind: 'node' }> = {
    kind: 'node',
    type: item.xynode.type,
    originalFilename:
      item.xynode.type === 'file' || item.xynode.type === 'audio'
        ? (item.xynode.data as { originalFilename?: string }).originalFilename
        : undefined,
    mimeType: item.xynode.type === 'image' ? (item.xynode.data as { mimeType?: string }).mimeType : undefined,
  }

  return buildDisplayName(item.name, target)
}

export function buildDisplayName(name: string, target: NameTarget): string {
  if (target.kind === 'canvas') {
    return name
  }

  const extension = getNodeDisplayExtension(target)
  return extension ? `${name}${extension}` : name
}

export function getUniqueSiblingName(options: {
  siblings: CanvasSibling[]
  preferredName: string
  target: NameTarget
  excludeItemId?: string
}): string {
  const baseName = normalizeEditableName(options.preferredName, options.target)
  if (!baseName) {
    return ''
  }

  const usedNames = new Set(
    options.siblings
      .filter((item) => item.id !== options.excludeItemId)
      .map((item) => normalizeForComparison(getCanvasItemDisplayName(item)))
  )

  if (!usedNames.has(normalizeForComparison(buildDisplayName(baseName, options.target)))) {
    return baseName
  }

  for (let suffix = 2; ; suffix++) {
    const candidate = `${baseName} ${suffix}`
    if (!usedNames.has(normalizeForComparison(buildDisplayName(candidate, options.target)))) {
      return candidate
    }
  }
}
