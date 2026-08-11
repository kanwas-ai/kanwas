import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { createElement } from 'react'
import {
  WORKSPACE_INTERLINK_TYPE,
  WORKSPACE_INTERLINK_VERSION,
  getWorkspaceInterlinkLabel,
  parseWorkspaceHref,
  workspaceInterlinkHrefFromProps,
} from 'shared/workspace-interlink'
import type { WorkspaceInterlinkSuggestion } from './workspaceInterlinks'

export interface WorkspaceInterlinkMenuState {
  from: number | null
  to: number | null
  href: string
  canonicalPath: string
  label: string
  referenceElement: Element
}

export interface WorkspaceInterlinkNodeInfo {
  from: number
  to: number
  href: string
  canonicalPath: string
  label: string
}

export interface WorkspaceInterlinkDomInfo {
  element: Element
  href: string
  canonicalPath: string
  label: string
}

export const WORKSPACE_INTERLINK_MENU_CLOSE_DELAY_MS = 120
export const WORKSPACE_INTERLINK_MENU_VERTICAL_OFFSET_PX = 10

export function getElementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }

  if (target instanceof Node) {
    return target.parentElement
  }

  return null
}

export function findWorkspaceInterlinkElement(target: EventTarget | null): Element | null {
  const element = getElementFromEventTarget(target)
  if (!element) {
    return null
  }

  const tokenElement = element.closest('[data-workspace-interlink="true"]')
  if (tokenElement) {
    return tokenElement
  }

  return element.closest(`[data-inline-content-type="${WORKSPACE_INTERLINK_TYPE}"]`)
}

export function readWorkspaceInterlinkDomInfo(interlinkElement: Element): WorkspaceInterlinkDomInfo | null {
  const inlineElement = interlinkElement.closest(`[data-inline-content-type="${WORKSPACE_INTERLINK_TYPE}"]`)
  const sourceElement = inlineElement ?? interlinkElement

  const rawHref = (sourceElement.getAttribute('data-href') ?? interlinkElement.getAttribute('data-href') ?? '').trim()
  const rawCanonicalPath = (
    sourceElement.getAttribute('data-canonical-path') ??
    interlinkElement.getAttribute('data-canonical-path') ??
    ''
  ).trim()
  const rawLabel = (
    sourceElement.getAttribute('data-label') ??
    interlinkElement.getAttribute('data-label') ??
    ''
  ).trim()

  const href = workspaceInterlinkHrefFromProps({
    href: rawHref,
    canonicalPath: rawCanonicalPath,
    label: rawLabel,
    v: WORKSPACE_INTERLINK_VERSION,
  })
  if (!href) {
    return null
  }

  const parsed = parseWorkspaceHref(href)
  const canonicalPath = rawCanonicalPath.length > 0 ? rawCanonicalPath : (parsed?.canonicalPath ?? '')

  return {
    element: sourceElement,
    href,
    canonicalPath,
    label: getWorkspaceInterlinkLabel(rawLabel, canonicalPath),
  }
}

export function toSuggestionMenuItems(
  suggestions: WorkspaceInterlinkSuggestion[],
  onInsert: (suggestion: WorkspaceInterlinkSuggestion) => void
): DefaultReactSuggestionItem[] {
  return suggestions.map((suggestion) => ({
    title: suggestion.title,
    aliases: suggestion.aliases,
    group: suggestion.menuGroup,
    size: 'small',
    icon: createElement('i', {
      className: `fa-solid ${suggestion.kind === 'canvas' ? 'fa-folder' : 'fa-file-lines'} text-xs opacity-60`,
    }),
    onItemClick: () => onInsert(suggestion),
  }))
}
