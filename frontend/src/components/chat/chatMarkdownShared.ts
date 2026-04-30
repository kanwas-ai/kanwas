import { createElement } from 'react'
import { defaultRemarkPlugins, type Components, type ExtraProps } from 'streamdown'
import type { JSX } from 'react'

export type MarkdownComponents = Components

export const DEFAULT_REMARK_PLUGIN_LIST = Object.values(defaultRemarkPlugins)

type PlainElementTag = keyof JSX.IntrinsicElements

export function stripMarkdownNodeProp<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const nextProps = { ...props }
  delete nextProps.node
  return nextProps
}

function createPlainComponent<Tag extends PlainElementTag>(tag: Tag) {
  return function PlainComponent(props: JSX.IntrinsicElements[Tag] & ExtraProps) {
    const { children, ...rest } = props
    return createElement(tag, stripMarkdownNodeProp(rest), children)
  }
}

export const plainMarkdownComponents: MarkdownComponents = {
  p: createPlainComponent('p'),
  h1: createPlainComponent('h1'),
  h2: createPlainComponent('h2'),
  h3: createPlainComponent('h3'),
  h4: createPlainComponent('h4'),
  h5: createPlainComponent('h5'),
  h6: createPlainComponent('h6'),
  strong: createPlainComponent('strong'),
  em: createPlainComponent('em'),
  del: createPlainComponent('del'),
  ul: createPlainComponent('ul'),
  ol: createPlainComponent('ol'),
  li: createPlainComponent('li'),
  blockquote: createPlainComponent('blockquote'),
  pre: createPlainComponent('pre'),
  code: createPlainComponent('code'),
  inlineCode: createPlainComponent('code'),
  hr: createPlainComponent('hr'),
  table: createPlainComponent('table'),
  thead: createPlainComponent('thead'),
  tbody: createPlainComponent('tbody'),
  tr: createPlainComponent('tr'),
  th: createPlainComponent('th'),
  td: createPlainComponent('td'),
}
