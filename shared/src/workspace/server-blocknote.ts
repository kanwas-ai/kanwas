import { BlockNoteSchema, createInlineContentSpec } from '@blocknote/core'
import { ServerBlockNoteEditor } from '@blocknote/server-util'
import {
  WORKSPACE_INTERLINK_PROP_SCHEMA,
  WORKSPACE_INTERLINK_TYPE,
  createWorkspaceInterlinkProps,
  getWorkspaceInterlinkLabel,
  workspaceInterlinkHrefFromProps,
  type WorkspaceInterlinkProps,
} from './workspace-interlink.js'

function getDocumentLike(): { createElement: (tag: string) => any } {
  const documentLike = (globalThis as { document?: { createElement: (tag: string) => any } }).document
  if (!documentLike) {
    throw new Error('BlockNote server runtime requires a DOM-like document')
  }
  return documentLike
}

export const workspaceInterlinkInlineSpec = createInlineContentSpec(
  {
    type: WORKSPACE_INTERLINK_TYPE,
    content: 'none',
    propSchema: WORKSPACE_INTERLINK_PROP_SCHEMA,
  },
  {
    runsBefore: ['link'],
    parse: (element: unknown) => {
      if (!element || typeof element !== 'object') {
        return undefined
      }

      const maybeElement = element as {
        tagName?: unknown
        getAttribute?: (name: string) => string | null
        textContent?: unknown
      }
      if (maybeElement.tagName !== 'A' || typeof maybeElement.getAttribute !== 'function') {
        return undefined
      }

      const href = maybeElement.getAttribute('href')
      if (!href) {
        return undefined
      }

      const label = typeof maybeElement.textContent === 'string' ? maybeElement.textContent : ''
      return createWorkspaceInterlinkProps(href, label) ?? undefined
    },
    render: (inlineContent: { props: WorkspaceInterlinkProps }) => {
      const props = inlineContent.props
      const href = workspaceInterlinkHrefFromProps(props) ?? ''
      const label = getWorkspaceInterlinkLabel(props.label, props.canonicalPath)

      const span = getDocumentLike().createElement('span')
      span.setAttribute('data-workspace-interlink', 'true')
      span.setAttribute('data-href', href)
      span.setAttribute('data-canonical-path', props.canonicalPath)
      span.textContent = label
      return { dom: span }
    },
    toExternalHTML: (inlineContent: { props: WorkspaceInterlinkProps }) => {
      const props = inlineContent.props
      const href = workspaceInterlinkHrefFromProps(props)
      if (!href) {
        return undefined
      }

      const label = getWorkspaceInterlinkLabel(props.label, props.canonicalPath)

      const anchor = getDocumentLike().createElement('a')
      anchor.setAttribute('href', href)
      anchor.textContent = label
      return { dom: anchor }
    },
  }
)

export const serverBlockNoteSchema = BlockNoteSchema.create().extend({
  inlineContentSpecs: {
    [WORKSPACE_INTERLINK_TYPE]: workspaceInterlinkInlineSpec,
  },
})

export function createServerBlockNoteEditor() {
  return ServerBlockNoteEditor.create({
    schema: serverBlockNoteSchema,
  })
}
