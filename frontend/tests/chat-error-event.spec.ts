import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Error as ErrorEvent } from '@/components/chat/events/Error'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Error event rendering', () => {
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

  it('shows friendly usage copy and hides technical code for out-of-usage errors', async () => {
    await act(async () => {
      root.render(
        React.createElement(ErrorEvent, {
          item: {
            id: 'err-1',
            type: 'error',
            timestamp: Date.now(),
            error: {
              code: 'OUT_OF_USAGE_LIMIT',
              message: 'Your organization has reached its monthly usage limit. Please try again later.',
              timestamp: Date.now(),
            },
          },
        })
      )
    })

    expect(document.body.textContent).toContain('Usage limit reached')
    expect(document.body.textContent).toContain('monthly usage limit')
    expect(document.body.textContent).not.toContain('OUT_OF_USAGE_LIMIT')
  })
})
