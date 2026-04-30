import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ComposioBashItem,
  ComposioSchemaItem,
  ComposioSearchItem,
  ComposioToolItem,
  ComposioWorkbenchItem,
} from 'backend/agent'
import { ComposioBash } from '@/components/chat/ComposioBash'
import { ComposioSchema } from '@/components/chat/ComposioSchema'
import { ComposioSearch } from '@/components/chat/ComposioSearch'
import { ComposioTool } from '@/components/chat/ComposioTool'
import { ComposioWorkbench } from '@/components/chat/ComposioWorkbench'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createComposioSearchItem(overrides: Partial<ComposioSearchItem> = {}): ComposioSearchItem {
  return {
    id: 'composio-search-1',
    type: 'composio_search',
    useCase: 'inspect Slack workspace connection',
    timestamp: Date.now(),
    status: 'completed',
    toolsFound: 2,
    tools: [
      {
        toolSlug: 'SLACK_LIST_CHANNELS',
        description: 'List channels in the connected Slack workspace.',
        toolkit: 'slack',
      },
      {
        toolSlug: 'GMAIL_FETCH_EMAILS',
        description: 'Fetch recent Gmail messages for context.',
        toolkit: 'gmail',
      },
    ],
    ...overrides,
  }
}

function createComposioToolItem(overrides: Partial<ComposioToolItem> = {}): ComposioToolItem {
  return {
    id: 'composio-tool-1',
    type: 'composio_tool',
    toolkit: 'slack',
    timestamp: Date.now(),
    status: 'completed',
    toolCount: 2,
    tools: [
      {
        slug: 'SLACK_SEND_MESSAGE',
        displayName: 'Slack: Send Message',
        toolkit: 'slack',
      },
      {
        slug: 'SLACK_LIST_CHANNELS',
        displayName: 'Slack: List Channels',
        toolkit: 'slack',
      },
    ],
    ...overrides,
  }
}

function createComposioBashItem(overrides: Partial<ComposioBashItem> = {}): ComposioBashItem {
  return {
    id: 'composio-bash-1',
    type: 'composio_bash',
    command: 'python scripts/check_connection.py --workspace slack',
    timestamp: Date.now(),
    status: 'failed',
    stderr: 'Missing SLACK_BOT_TOKEN',
    error: 'Remote command failed',
    ...overrides,
  }
}

function createComposioSchemaItem(overrides: Partial<ComposioSchemaItem> = {}): ComposioSchemaItem {
  return {
    id: 'composio-schema-1',
    type: 'composio_schema',
    toolSlugs: ['SLACK_SEND_MESSAGE', 'SLACK_LIST_CHANNELS'],
    timestamp: Date.now(),
    status: 'completed',
    schemasFound: 2,
    ...overrides,
  }
}

function createComposioWorkbenchItem(overrides: Partial<ComposioWorkbenchItem> = {}): ComposioWorkbenchItem {
  return {
    id: 'composio-workbench-1',
    type: 'composio_workbench',
    codeDescription: 'Inspect connected Slack account metadata.',
    timestamp: Date.now(),
    status: 'completed',
    code: 'print(slack_account)',
    ...overrides,
  }
}

describe('composio timeline events', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders tool search as a chat timeline pill with expandable results', async () => {
    await act(async () => {
      root.render(<ComposioSearch item={createComposioSearchItem()} />)
    })

    expect(container.textContent).toContain('Found tools for')
    expect(container.textContent).toContain('inspect Slack workspace connection')
    expect(container.textContent).toContain('(2 tools)')
    expect(container.textContent).toContain('Gmail')
    expect(container.querySelector('.fa-person-running')).not.toBeNull()
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.bg-block-highlight.rounded-full')).toBeNull()

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('SLACK_LIST_CHANNELS')
    expect(container.textContent).toContain('GMAIL_FETCH_EMAILS')
    expect(container.textContent).toContain('List channels in the connected Slack workspace.')
  })

  it('renders executed tools as a compact app-aware timeline pill', async () => {
    await act(async () => {
      root.render(<ComposioTool item={createComposioToolItem()} />)
    })

    expect(container.textContent).toContain('Used 2 Slack tools')
    expect(container.textContent).toContain('Slack: Send Message, Slack: List Channels')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.bg-block-highlight.rounded-full')).toBeNull()

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('SLACK_SEND_MESSAGE')
    expect(container.textContent).toContain('SLACK_LIST_CHANNELS')
  })

  it('renders remote bash failures in the same timeline style', async () => {
    await act(async () => {
      root.render(<ComposioBash item={createComposioBashItem()} />)
    })

    expect(container.textContent).toContain('Run')
    expect(container.textContent).toContain('failed')
    expect(container.textContent).toContain('Remote command failed')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.bg-block-highlight.rounded-full')).toBeNull()

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Missing SLACK_BOT_TOKEN')
  })

  it('renders schema fetching results as an expandable timeline pill', async () => {
    await act(async () => {
      root.render(<ComposioSchema item={createComposioSchemaItem()} />)
    })

    expect(container.textContent).toContain('Fetched tool schemas')
    expect(container.textContent).toContain('(2 schemas)')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.bg-block-highlight.rounded-full')).toBeNull()

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('SLACK_SEND_MESSAGE')
    expect(container.textContent).toContain('SLACK_LIST_CHANNELS')
  })

  it('renders remote workbench code as a compact expandable timeline pill', async () => {
    await act(async () => {
      root.render(<ComposioWorkbench item={createComposioWorkbenchItem()} />)
    })

    expect(container.textContent).toContain('Ran remote code')
    expect(container.textContent).toContain('Inspect connected Slack account metadata.')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.bg-block-highlight.rounded-full')).toBeNull()

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('print(slack_account)')
  })
})
