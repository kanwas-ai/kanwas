import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatItem } from 'backend/agent'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createChatItem(message: string): ChatItem {
  return {
    id: 'chat-item-1',
    type: 'chat',
    message,
    timestamp: Date.now(),
  }
}

describe('ChatMessage workspace path links', () => {
  let root: Root
  let container: HTMLDivElement

  async function renderMessage(
    message: string,
    onWorkspaceLinkNavigate?: (href: string) => boolean,
    streaming = false
  ) {
    await act(async () => {
      root.render(
        React.createElement(ChatMessage, {
          item: createChatItem(message),
          streaming,
          onWorkspaceLinkNavigate,
        })
      )
    })
  }

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

  it('linkifies workspace file paths that contain spaces', async () => {
    const onWorkspaceLinkNavigate = vi.fn(() => true)
    await renderMessage('Read /workspace/Planning Board/My File.md please.', onWorkspaceLinkNavigate)

    const link = container.querySelector('a.chat-link') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    expect(link?.textContent).toBe('/workspace/Planning Board/My File.md')
    expect(link?.getAttribute('href')).toBe('/workspace/Planning%20Board/My%20File.md')
    expect(container.textContent).toContain('please.')

    await act(async () => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })

    expect(onWorkspaceLinkNavigate).toHaveBeenCalledWith('/workspace/Planning%20Board/My%20File.md')
  })

  it('linkifies workspace canvas paths with spaces without a trailing slash', async () => {
    await renderMessage('Open /workspace/Planning Board.')

    const link = container.querySelector('a.chat-link') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    expect(link?.textContent).toBe('/workspace/Planning Board')
    expect(link?.getAttribute('href')).toBe('/workspace/Planning%20Board')
    expect(container.textContent).toContain('Open /workspace/Planning Board.')
  })

  it('separates multiple workspace paths with spaces into distinct links', async () => {
    await renderMessage('Compare /workspace/Docs/My File.md and /workspace/Docs/Other File.md.')

    const links = Array.from(container.querySelectorAll('a.chat-link')) as HTMLAnchorElement[]
    expect(links).toHaveLength(2)
    expect(links[0]?.textContent).toBe('/workspace/Docs/My File.md')
    expect(links[0]?.getAttribute('href')).toBe('/workspace/Docs/My%20File.md')
    expect(links[1]?.textContent).toBe('/workspace/Docs/Other File.md')
    expect(links[1]?.getAttribute('href')).toBe('/workspace/Docs/Other%20File.md')
  })

  it('still linkifies workspace paths while streaming', async () => {
    await renderMessage('Read /workspace/Planning Board/My File.md please.', undefined, true)

    const link = container.querySelector('a.chat-link') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    expect(link?.textContent).toBe('/workspace/Planning Board/My File.md')
    expect(link?.getAttribute('href')).toBe('/workspace/Planning%20Board/My%20File.md')
  })

  it('renders incomplete markdown links as plain text while streaming', async () => {
    await renderMessage('Look at [docs](https://exa', undefined, true)

    const links = Array.from(container.querySelectorAll('a.chat-link')) as HTMLAnchorElement[]
    expect(links).toHaveLength(0)
    expect(container.textContent).toContain('Look at docs')
  })
})
