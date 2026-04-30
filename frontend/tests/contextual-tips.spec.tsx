import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/api/userConfig', () => ({
  getUserConfig: vi.fn(async () => ({ config: { dismissedTipIds: [] } })),
  updateUserConfig: vi.fn(async () => ({})),
}))

type TipTimelineItem = {
  type: string
  tipId?: string
  connector?: string
  label?: string
}

function installLocalStorageMock() {
  const values = new Map<string, string>()

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key)
      }),
      clear: vi.fn(() => {
        values.clear()
      }),
    },
  })
}

const timelineWithDirectTip: TipTimelineItem[] = [
  { type: 'user_message' },
  { type: 'contextual_tip', tipId: 'direct_mode_available' },
  { type: 'chat' },
]

const timelineWithoutAgentText: TipTimelineItem[] = [
  { type: 'user_message' },
  { type: 'contextual_tip', tipId: 'direct_mode_available' },
]

describe('contextual tips', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    installLocalStorageMock()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    document.body.innerHTML = ''
  })

  it('surfaces the direct mode tip only after an agent chat response', async () => {
    const { useActiveTips } = await import('@/store/useTipStore')

    function Harness({ timeline }: { timeline: TipTimelineItem[] }) {
      const tips = useActiveTips(timeline)
      return <div data-direct-mode-available={String(tips.directModeAvailable)} />
    }

    await act(async () => {
      root.render(<Harness timeline={timelineWithoutAgentText} />)
    })

    expect(container.querySelector('[data-direct-mode-available="false"]')).toBeTruthy()

    await act(async () => {
      root.render(<Harness timeline={timelineWithDirectTip} />)
    })

    expect(container.querySelector('[data-direct-mode-available="true"]')).toBeTruthy()
  })

  it('hides the direct mode tip after dismissal', async () => {
    const { dismissTip, useActiveTips } = await import('@/store/useTipStore')

    function Harness() {
      const tips = useActiveTips(timelineWithDirectTip)
      return (
        <button
          type="button"
          data-direct-mode-available={String(tips.directModeAvailable)}
          onClick={() => dismissTip('direct_mode_available')}
        >
          Dismiss
        </button>
      )
    }

    await act(async () => {
      root.render(<Harness />)
    })

    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.dataset.directModeAvailable).toBe('true')

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(button.dataset.directModeAvailable).toBe('false')
  })
})
