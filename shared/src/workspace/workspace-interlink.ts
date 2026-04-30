export const WORKSPACE_PATH_PREFIX = '/workspace/'
export const WORKSPACE_INTERLINK_TYPE = 'workspaceInterlink'
export const WORKSPACE_INTERLINK_VERSION = '1'
export const WORKSPACE_INTERLINK_PROP_SCHEMA = {
  href: { default: '' },
  canonicalPath: { default: '' },
  label: { default: '' },
  v: { default: WORKSPACE_INTERLINK_VERSION },
} as const

const ABSOLUTE_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export interface ParsedWorkspaceHref {
  href: string
  canonicalPath: string
}

export interface WorkspaceInterlinkProps {
  href: string
  canonicalPath: string
  label: string
  v: string
}

function decodeWorkspacePathname(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

function normalizeWorkspaceRelativePath(relativePath: string): string {
  return relativePath.replace(/^\/+/, '').replace(/\/+$/, '')
}

function hasDotSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => segment === '.' || segment === '..')
}

function encodeWorkspaceRelativePath(relativePath: string): string {
  if (!relativePath) {
    return ''
  }

  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function shouldKeepTrailingSlash(pathname: string): boolean {
  return pathname.endsWith('/') && pathname !== WORKSPACE_PATH_PREFIX
}

export function parseWorkspaceHref(href: string): ParsedWorkspaceHref | null {
  const trimmedHref = href.trim()
  if (!trimmedHref) {
    return null
  }

  if (ABSOLUTE_SCHEME_REGEX.test(trimmedHref) || trimmedHref.startsWith('//')) {
    return null
  }

  let url: URL
  try {
    url = new URL(trimmedHref, 'https://workspace.local')
  } catch {
    return null
  }

  const decodedPathname = decodeWorkspacePathname(url.pathname)
  const normalizedPathname = decodedPathname === '/workspace' ? WORKSPACE_PATH_PREFIX : decodedPathname

  if (!normalizedPathname.startsWith(WORKSPACE_PATH_PREFIX)) {
    return null
  }

  const canonicalPath = normalizeWorkspaceRelativePath(normalizedPathname.slice(WORKSPACE_PATH_PREFIX.length))
  if (hasDotSegment(canonicalPath)) {
    return null
  }

  const trailingSlash = shouldKeepTrailingSlash(normalizedPathname)
  const encodedCanonicalPath = encodeWorkspaceRelativePath(canonicalPath)
  const workspacePath =
    canonicalPath.length === 0
      ? WORKSPACE_PATH_PREFIX
      : `${WORKSPACE_PATH_PREFIX}${encodedCanonicalPath}${trailingSlash ? '/' : ''}`

  return {
    href: `${workspacePath}${url.search}${url.hash}`,
    canonicalPath,
  }
}

export function isWorkspaceHref(href: string): boolean {
  return parseWorkspaceHref(href) !== null
}

export function buildWorkspaceHref(canonicalPath: string, options?: { trailingSlash?: boolean }): string {
  const normalizedPath = normalizeWorkspaceRelativePath(canonicalPath)
  if (normalizedPath.length === 0) {
    return WORKSPACE_PATH_PREFIX
  }

  const encodedPath = encodeWorkspaceRelativePath(normalizedPath)
  const suffix = options?.trailingSlash ? '/' : ''
  return `${WORKSPACE_PATH_PREFIX}${encodedPath}${suffix}`
}

export function getWorkspaceInterlinkLabel(label: string, canonicalPath: string): string {
  const trimmedLabel = label.trim()
  if (trimmedLabel.length > 0) {
    return trimmedLabel
  }

  const basename = canonicalPath.split('/').filter(Boolean).pop()
  if (!basename) {
    return 'workspace'
  }

  return basename.replace(/\.(url|text|sticky)\.yaml$/, '').replace(/\.md$/, '')
}

export function createWorkspaceInterlinkProps(href: string, label: string): WorkspaceInterlinkProps | null {
  const parsed = parseWorkspaceHref(href)
  if (!parsed) {
    return null
  }

  return {
    href: parsed.href,
    canonicalPath: parsed.canonicalPath,
    label: getWorkspaceInterlinkLabel(label, parsed.canonicalPath),
    v: WORKSPACE_INTERLINK_VERSION,
  }
}

export function workspaceInterlinkHrefFromProps(props: Partial<WorkspaceInterlinkProps>): string | null {
  if (typeof props.href === 'string' && props.href.trim().length > 0) {
    const parsed = parseWorkspaceHref(props.href)
    if (parsed) {
      return parsed.href
    }
  }

  if (typeof props.canonicalPath === 'string') {
    const canonicalPath = props.canonicalPath.trim()
    const normalizedCanonicalPath = canonicalPath.replace(/^\/+/, '')
    const candidateHref = canonicalPath.startsWith(WORKSPACE_PATH_PREFIX)
      ? canonicalPath
      : `${WORKSPACE_PATH_PREFIX}${normalizedCanonicalPath}`

    const parsed = parseWorkspaceHref(candidateHref)
    if (parsed) {
      return parsed.href
    }

    const fallbackHref = buildWorkspaceHref(normalizedCanonicalPath)
    const parsedFallback = parseWorkspaceHref(fallbackHref)
    if (parsedFallback) {
      return parsedFallback.href
    }
  }

  return null
}

function inlineContentToPlainText(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  let result = ''
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const maybeText = (item as { type?: unknown; text?: unknown }).type
    if (maybeText !== 'text') {
      continue
    }

    const text = (item as { text?: unknown }).text
    if (typeof text === 'string') {
      result += text
    }
  }

  return result
}

export function convertWorkspaceLinkInlineToInterlink(inlineContent: unknown): unknown {
  if (!inlineContent || typeof inlineContent !== 'object') {
    return inlineContent
  }

  const maybeLink = inlineContent as { type?: unknown; href?: unknown; content?: unknown }
  if (maybeLink.type !== 'link' || typeof maybeLink.href !== 'string') {
    return inlineContent
  }

  const props = createWorkspaceInterlinkProps(maybeLink.href, inlineContentToPlainText(maybeLink.content))
  if (!props) {
    return inlineContent
  }

  return {
    type: WORKSPACE_INTERLINK_TYPE,
    props,
  }
}

function normalizeWorkspaceInterlinkProps(props: unknown): WorkspaceInterlinkProps | null {
  if (!props || typeof props !== 'object') {
    return null
  }

  const raw = props as Partial<WorkspaceInterlinkProps>
  const href = workspaceInterlinkHrefFromProps(raw)
  if (!href) {
    return null
  }

  const parsed = parseWorkspaceHref(href)
  if (!parsed) {
    return null
  }

  const label = typeof raw.label === 'string' ? raw.label : ''

  return {
    href: parsed.href,
    canonicalPath: parsed.canonicalPath,
    label: getWorkspaceInterlinkLabel(label, parsed.canonicalPath),
    v: typeof raw.v === 'string' && raw.v.length > 0 ? raw.v : WORKSPACE_INTERLINK_VERSION,
  }
}

export function convertWorkspaceInterlinkInlineToLink(inlineContent: unknown): unknown {
  if (!inlineContent || typeof inlineContent !== 'object') {
    return inlineContent
  }

  const maybeInterlink = inlineContent as { type?: unknown; props?: unknown }
  if (maybeInterlink.type !== WORKSPACE_INTERLINK_TYPE) {
    return inlineContent
  }

  const props = normalizeWorkspaceInterlinkProps(maybeInterlink.props)
  if (!props) {
    return inlineContent
  }

  return {
    type: 'link',
    href: props.href,
    content: [
      {
        type: 'text',
        text: getWorkspaceInterlinkLabel(props.label, props.canonicalPath),
        styles: {},
      },
    ],
  }
}

function mapInlineContentArray(content: unknown[], mapper: (inlineContent: unknown) => unknown): unknown[] {
  let changed = false
  const mapped = content.map((inlineContent) => {
    const nextInlineContent = mapper(inlineContent)
    if (nextInlineContent !== inlineContent) {
      changed = true
    }
    return nextInlineContent
  })

  return changed ? mapped : content
}

function mapTableContent(tableContent: { rows: unknown[] }, mapper: (inlineContent: unknown) => unknown): unknown {
  let rowsChanged = false

  const mappedRows = tableContent.rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return row
    }

    const rowRecord = row as { cells?: unknown[] }
    if (!Array.isArray(rowRecord.cells)) {
      return row
    }

    let cellsChanged = false
    const mappedCells = rowRecord.cells.map((cell) => {
      if (Array.isArray(cell)) {
        const mappedInlineContent = mapInlineContentArray(cell, mapper)
        if (mappedInlineContent !== cell) {
          cellsChanged = true
        }
        return mappedInlineContent
      }

      if (!cell || typeof cell !== 'object') {
        return cell
      }

      const cellRecord = cell as { content?: unknown[] }
      if (!Array.isArray(cellRecord.content)) {
        return cell
      }

      const mappedCellContent = mapInlineContentArray(cellRecord.content, mapper)
      if (mappedCellContent === cellRecord.content) {
        return cell
      }

      cellsChanged = true
      return {
        ...cellRecord,
        content: mappedCellContent,
      }
    })

    if (!cellsChanged) {
      return row
    }

    rowsChanged = true
    return {
      ...rowRecord,
      cells: mappedCells,
    }
  })

  if (!rowsChanged) {
    return tableContent
  }

  return {
    ...tableContent,
    rows: mappedRows,
  }
}

function mapBlocks(
  blocks: unknown[],
  mapper: (inlineContent: unknown) => unknown,
  transformChildren: (blocks: unknown[]) => unknown[]
): unknown[] {
  let blocksChanged = false

  const mappedBlocks = blocks.map((block) => {
    if (!block || typeof block !== 'object') {
      return block
    }

    const blockRecord = block as { content?: unknown; children?: unknown }
    let blockChanged = false
    let nextContent = blockRecord.content
    let nextChildren = blockRecord.children

    if (Array.isArray(blockRecord.content)) {
      const mappedInlineContent = mapInlineContentArray(blockRecord.content, mapper)
      if (mappedInlineContent !== blockRecord.content) {
        blockChanged = true
        nextContent = mappedInlineContent
      }
    } else if (
      blockRecord.content &&
      typeof blockRecord.content === 'object' &&
      (blockRecord.content as { type?: unknown }).type === 'tableContent' &&
      Array.isArray((blockRecord.content as { rows?: unknown[] }).rows)
    ) {
      const mappedTable = mapTableContent(blockRecord.content as { rows: unknown[] }, mapper)
      if (mappedTable !== blockRecord.content) {
        blockChanged = true
        nextContent = mappedTable
      }
    }

    if (Array.isArray(blockRecord.children)) {
      const mappedChildren = transformChildren(blockRecord.children)
      if (mappedChildren !== blockRecord.children) {
        blockChanged = true
        nextChildren = mappedChildren
      }
    }

    if (!blockChanged) {
      return block
    }

    blocksChanged = true
    return {
      ...blockRecord,
      content: nextContent,
      children: nextChildren,
    }
  })

  return blocksChanged ? mappedBlocks : blocks
}

export function convertWorkspaceLinksToInterlinksInBlocks<T>(blocks: T[]): T[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return blocks
  }

  const transformChildren = (children: unknown[]) =>
    mapBlocks(children, convertWorkspaceLinkInlineToInterlink, transformChildren)
  return mapBlocks(blocks as unknown[], convertWorkspaceLinkInlineToInterlink, transformChildren) as T[]
}

export function convertWorkspaceInterlinksToLinksInBlocks<T>(blocks: T[]): T[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return blocks
  }

  const transformChildren = (children: unknown[]) =>
    mapBlocks(children, convertWorkspaceInterlinkInlineToLink, transformChildren)
  return mapBlocks(blocks as unknown[], convertWorkspaceInterlinkInlineToLink, transformChildren) as T[]
}
