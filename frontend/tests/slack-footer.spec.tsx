import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SlackFooter, SLACK_INVITE_URL } from '@/components/sidebar/explorer/SlackFooter'
import { getToolkitLogo } from '@/utils/toolkitLogos'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SlackFooter', () => {
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

  it('renders the Slack invite link with the Slack icon', async () => {
    await act(async () => {
      root.render(<SlackFooter />)
    })

    const link = container.querySelector('a') as HTMLAnchorElement | null

    expect(link).not.toBeNull()
    expect(link?.textContent).toContain('Join our Slack')
    expect(link?.getAttribute('href')).toBe(SLACK_INVITE_URL)
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.querySelector('img')?.getAttribute('src')).toBe(getToolkitLogo('slack'))
  })
})
