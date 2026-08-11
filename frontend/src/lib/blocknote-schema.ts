import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { createReactInlineContentSpec } from '@blocknote/react'
import { createElement } from 'react'
import {
  WORKSPACE_INTERLINK_PROP_SCHEMA,
  WORKSPACE_INTERLINK_TYPE,
  createWorkspaceInterlinkProps,
  getWorkspaceInterlinkLabel,
  workspaceInterlinkHrefFromProps,
  type WorkspaceInterlinkProps,
} from 'shared/workspace-interlink'
import { slackMessageBlockSpec } from './slack-message-block'
import { SLACK_MESSAGE_TYPE } from './slack-message-block-constants'

export const workspaceInterlinkInlineSpec = createReactInlineContentSpec(
  {
    type: WORKSPACE_INTERLINK_TYPE,
    content: 'none',
    propSchema: WORKSPACE_INTERLINK_PROP_SCHEMA,
  },
  {
    runsBefore: ['link'],
    parse: (element) => {
      const href = element.getAttribute('href')
      if (!href) {
        return undefined
      }

      return createWorkspaceInterlinkProps(href, element.textContent ?? '') ?? undefined
    },
    render: ({ inlineContent }) => {
      const props = inlineContent.props as WorkspaceInterlinkProps
      const href = workspaceInterlinkHrefFromProps(props) ?? ''
      const label = getWorkspaceInterlinkLabel(props.label, props.canonicalPath)

      return createElement(
        'span',
        {
          'className': 'workspace-interlink-token',
          'data-workspace-interlink': 'true',
          'data-href': href,
          'data-canonical-path': props.canonicalPath,
          'data-label': label,
        },
        createElement('span', { className: 'workspace-interlink-token-label' }, label),
        createElement('i', {
          'className': 'fa-solid fa-diagram-project workspace-interlink-token-icon',
          'aria-hidden': true,
        })
      )
    },
    toExternalHTML: ({ inlineContent }) => {
      const props = inlineContent.props as WorkspaceInterlinkProps
      const href = workspaceInterlinkHrefFromProps(props)
      if (!href) {
        return createElement('span', null, getWorkspaceInterlinkLabel(props.label, props.canonicalPath))
      }

      return createElement('a', { href }, getWorkspaceInterlinkLabel(props.label, props.canonicalPath))
    },
  }
)

// Use .extend() to add to default blocks, not replace them
// Note: Using BlockNote's default code block (no custom syntax highlighting)
export const blockNoteSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    ...defaultBlockSpecs,
    [SLACK_MESSAGE_TYPE]: slackMessageBlockSpec(),
  },
  inlineContentSpecs: {
    [WORKSPACE_INTERLINK_TYPE]: workspaceInterlinkInlineSpec,
  },
})

export type BlockNoteSchemaType = typeof blockNoteSchema
