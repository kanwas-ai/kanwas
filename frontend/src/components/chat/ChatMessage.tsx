import { useEffect, useMemo, useRef } from 'react'
import type { ChatItem } from 'backend/agent'
import { parseWorkspaceHref } from 'shared/workspace-interlink'
import { ChatMarkdown } from './ChatMarkdown'
import { plainMarkdownComponents, stripMarkdownNodeProp, type MarkdownComponents } from './chatMarkdownShared'

interface ChatMessageProps {
  item: ChatItem
  streaming?: boolean
  onWorkspaceLinkNavigate?: (href: string) => boolean
}

interface MarkdownNode {
  type?: string
  value?: string
  url?: string
  title?: string | null
  children?: MarkdownNode[]
}

const WORKSPACE_LINK_PREFIX = '/workspace/'
const WORKSPACE_BOUNDARY_PUNCTUATION = new Set([
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '"',
  "'",
  ',',
  ';',
  ':',
  '!',
  '?',
  '.',
])
const STRONG_BOUNDARY_TERMINATORS = new Set(['.', ',', '!', '?', ';', ':', ')', ']', '}', '>', '"', "'"])
const TRAILING_PUNCTUATION = new Set([...STRONG_BOUNDARY_TERMINATORS].filter((character) => character !== '>'))

type SearchLimitReason = 'textEnd' | 'lineBreak' | 'nextWorkspaceStart'

interface WorkspacePathMatch {
  href: string
  path: string
  trailing: string
  consumedLength: number
}

interface WorkspaceSearchWindow {
  value: string
  reason: SearchLimitReason
}

function isWorkspaceBoundaryCharacter(character: string): boolean {
  return /\s/.test(character) || WORKSPACE_BOUNDARY_PUNCTUATION.has(character)
}

function isStrongWorkspaceBoundaryCharacter(character: string | undefined): boolean {
  return typeof character === 'string' && STRONG_BOUNDARY_TERMINATORS.has(character)
}

function hasWorkspaceBoundary(text: string, index: number): boolean {
  if (index === 0) {
    return true
  }

  const previousCharacter = text[index - 1]
  return !/[A-Za-z0-9]/.test(previousCharacter)
}

function findNextWorkspaceStart(text: string, fromIndex: number): number {
  let candidateIndex = text.indexOf(WORKSPACE_LINK_PREFIX, fromIndex)
  while (candidateIndex !== -1) {
    if (hasWorkspaceBoundary(text, candidateIndex)) {
      return candidateIndex
    }

    candidateIndex = text.indexOf(WORKSPACE_LINK_PREFIX, candidateIndex + WORKSPACE_LINK_PREFIX.length)
  }

  return -1
}

function findNextLineBreak(text: string, fromIndex: number): number {
  const newlineIndex = text.indexOf('\n', fromIndex)
  const carriageReturnIndex = text.indexOf('\r', fromIndex)

  if (newlineIndex === -1) {
    return carriageReturnIndex
  }

  if (carriageReturnIndex === -1) {
    return newlineIndex
  }

  return Math.min(newlineIndex, carriageReturnIndex)
}

function trimTrailingPunctuation(rawPath: string): { path: string; trailing: string } {
  let end = rawPath.length
  while (end > WORKSPACE_LINK_PREFIX.length && TRAILING_PUNCTUATION.has(rawPath[end - 1])) {
    end -= 1
  }

  return {
    path: rawPath.slice(0, end),
    trailing: rawPath.slice(end),
  }
}

function stripSearchAndHash(path: string): string {
  return path.split(/[?#]/)[0]
}

function hasLikelyFileExtension(pathSegment: string): boolean {
  return /\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pathSegment)
}

function isLikelyCompleteWorkspacePath(path: string, options: { allowSpaceWithoutExtension: boolean }): boolean {
  const pathWithoutSearchOrHash = stripSearchAndHash(path)

  if (pathWithoutSearchOrHash === WORKSPACE_LINK_PREFIX || pathWithoutSearchOrHash.endsWith('/')) {
    return true
  }

  if (!/\s/.test(pathWithoutSearchOrHash)) {
    return true
  }

  const lastSegment = pathWithoutSearchOrHash.split('/').pop() ?? ''
  if (hasLikelyFileExtension(lastSegment)) {
    return true
  }

  if (lastSegment.includes('.')) {
    return false
  }

  return options.allowSpaceWithoutExtension
}

function resolveWorkspacePath(rawPath: string): { href: string; path: string; trailing: string } | null {
  if (!rawPath.startsWith(WORKSPACE_LINK_PREFIX)) {
    return null
  }

  const trimmed = trimTrailingPunctuation(rawPath)
  const parsed = parseWorkspaceHref(trimmed.path)
  if (!parsed) {
    return null
  }

  return {
    href: parsed.href,
    path: trimmed.path,
    trailing: trimmed.trailing,
  }
}

function getWorkspaceSearchWindow(text: string, startIndex: number): WorkspaceSearchWindow {
  const nextLineBreakIndex = findNextLineBreak(text, startIndex)
  const nextWorkspaceStartIndex = findNextWorkspaceStart(text, startIndex + WORKSPACE_LINK_PREFIX.length)

  let searchLimit = text.length
  let searchLimitReason: SearchLimitReason = 'textEnd'

  if (nextLineBreakIndex !== -1 && nextLineBreakIndex < searchLimit) {
    searchLimit = nextLineBreakIndex
    searchLimitReason = 'lineBreak'
  }

  if (nextWorkspaceStartIndex !== -1 && nextWorkspaceStartIndex < searchLimit) {
    searchLimit = nextWorkspaceStartIndex
    searchLimitReason = 'nextWorkspaceStart'
  }

  return {
    value: text.slice(startIndex, searchLimit),
    reason: searchLimitReason,
  }
}

function shouldAllowSpaceWithoutExtension(options: {
  endIndex: number
  searchWindowLength: number
  searchLimitReason: SearchLimitReason
  nextCharacter: string | undefined
}): boolean {
  const { endIndex, searchWindowLength, searchLimitReason, nextCharacter } = options
  if (endIndex < searchWindowLength) {
    return isStrongWorkspaceBoundaryCharacter(nextCharacter)
  }

  return searchLimitReason !== 'nextWorkspaceStart'
}

function findBestWorkspaceMatch(searchWindow: WorkspaceSearchWindow): WorkspacePathMatch | null {
  let bestMatch: WorkspacePathMatch | null = null

  for (let endIndex = WORKSPACE_LINK_PREFIX.length; endIndex <= searchWindow.value.length; endIndex++) {
    const nextCharacter = searchWindow.value[endIndex]
    const atBoundary = endIndex === searchWindow.value.length || isWorkspaceBoundaryCharacter(nextCharacter)
    if (!atBoundary) {
      continue
    }

    const resolved = resolveWorkspacePath(searchWindow.value.slice(0, endIndex))
    if (
      !resolved ||
      !isLikelyCompleteWorkspacePath(resolved.path, {
        allowSpaceWithoutExtension: shouldAllowSpaceWithoutExtension({
          endIndex,
          searchWindowLength: searchWindow.value.length,
          searchLimitReason: searchWindow.reason,
          nextCharacter,
        }),
      })
    ) {
      continue
    }

    bestMatch = {
      ...resolved,
      consumedLength: endIndex,
    }
  }

  return bestMatch
}

function findWorkspacePathMatchAt(
  text: string,
  startIndex: number
): { href: string; path: string; trailing: string; consumedLength: number } | null {
  const searchWindow = getWorkspaceSearchWindow(text, startIndex)
  return findBestWorkspaceMatch(searchWindow)
}

function linkifyWorkspacePathsInText(value: string): MarkdownNode[] | null {
  const parts: MarkdownNode[] = []
  let lastIndex = 0
  let searchIndex = 0
  let replaced = false

  while (searchIndex < value.length) {
    const matchStart = findNextWorkspaceStart(value, searchIndex)
    if (matchStart === -1) {
      break
    }

    const resolved = findWorkspacePathMatchAt(value, matchStart)
    if (!resolved) {
      searchIndex = matchStart + WORKSPACE_LINK_PREFIX.length
      continue
    }

    if (matchStart > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, matchStart) })
    }

    parts.push({
      type: 'link',
      url: resolved.href,
      title: null,
      children: [{ type: 'text', value: resolved.path }],
    })

    if (resolved.trailing) {
      parts.push({ type: 'text', value: resolved.trailing })
    }

    lastIndex = matchStart + resolved.consumedLength
    searchIndex = lastIndex
    replaced = true
  }

  if (!replaced) {
    return null
  }

  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) })
  }

  return parts
}

function linkifyWorkspacePaths(node: MarkdownNode): void {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return
  }

  const nextChildren: MarkdownNode[] = []

  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const linkedChildren = linkifyWorkspacePathsInText(child.value)
      if (linkedChildren) {
        nextChildren.push(...linkedChildren)
        continue
      }
    }

    const shouldSkipChildren =
      child.type === 'link' || child.type === 'inlineCode' || child.type === 'code' || child.type === 'html'

    if (!shouldSkipChildren) {
      linkifyWorkspacePaths(child)
    }

    nextChildren.push(child)
  }

  node.children = nextChildren
}

function remarkWorkspacePathLinks() {
  return (tree: unknown) => {
    if (!tree || typeof tree !== 'object') {
      return
    }

    linkifyWorkspacePaths(tree as MarkdownNode)
  }
}

const WORKSPACE_PATH_REMARK_PLUGINS = [remarkWorkspacePathLinks]

export function ChatMessage({ item, streaming, onWorkspaceLinkNavigate }: ChatMessageProps) {
  const onWorkspaceLinkNavigateRef = useRef(onWorkspaceLinkNavigate)

  useEffect(() => {
    onWorkspaceLinkNavigateRef.current = onWorkspaceLinkNavigate
  }, [onWorkspaceLinkNavigate])

  const components = useMemo<MarkdownComponents>(
    () => ({
      ...plainMarkdownComponents,
      a: ({ href, children, ...props }) => {
        const parsed = typeof href === 'string' ? parseWorkspaceHref(href) : null
        const resolvedHref = parsed?.href ?? href
        const isWorkspaceLink = parsed !== null

        return (
          <a
            {...stripMarkdownNodeProp(props)}
            href={resolvedHref}
            target={isWorkspaceLink ? undefined : '_blank'}
            rel={isWorkspaceLink ? undefined : 'noopener noreferrer'}
            className="chat-link"
            onClick={(event) => {
              const handleWorkspaceLinkNavigate = onWorkspaceLinkNavigateRef.current

              if (!isWorkspaceLink || !resolvedHref || !handleWorkspaceLinkNavigate) {
                return
              }

              if (event.defaultPrevented || event.button !== 0) {
                return
              }

              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return
              }

              const handled = handleWorkspaceLinkNavigate(resolvedHref)
              if (handled) {
                event.preventDefault()
              }
            }}
          >
            {children}
          </a>
        )
      },
    }),
    []
  )

  return (
    <div
      className="text-chat-text text-base font-medium max-w-none break-words [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:mb-3 [&_h2]:mb-3 [&_h3]:mb-3 [&_h4]:mb-3 [&_hr]:my-4 [&_hr]:border-outline [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-chat-text [&_code]:break-all [&_pre]:bg-canvas [&_pre]:border [&_pre]:border-outline [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:break-normal [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:mb-3 [&_table]:border [&_table]:border-outline [&_table]:rounded-lg [&_table]:overflow-hidden [&_th]:border-b [&_th]:border-r [&_th]:border-outline [&_th]:bg-canvas [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th:last-child]:border-r-0 [&_td]:border-b [&_td]:border-r [&_td]:border-outline [&_td]:px-3 [&_td]:py-2 [&_td:last-child]:border-r-0 [&_tr:last-child_td]:border-b-0"
      style={{ lineHeight: '1.6' }}
    >
      <ChatMarkdown
        markdown={item.message}
        streaming={streaming}
        components={components}
        remarkPlugins={WORKSPACE_PATH_REMARK_PLUGINS}
      />
    </div>
  )
}
