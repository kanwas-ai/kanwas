import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxy } from 'valtio'
import type { AgentMode } from 'backend/agent'
import { AgentModeSelector } from '@/components/chat/AgentModeSelector'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  useChat: vi.fn(),
  setAgentMode: vi.fn(),
}))

vi.mock('@/providers/chat', () => ({
  useChat: () => mocks.useChat(),
}))

vi.mock('@/providers/chat/hooks', () => ({
  useSetAgentMode: () => mocks.setAgentMode,
}))

function createChatState(agentMode: AgentMode = 'thinking') {
  return proxy({
    timeline: [],
    invocationId: null,
    panelView: 'chat',
    activeTaskId: null,
    isHydratingTask: false,
    agentMode,
    yoloMode: false,
    streamingItems: {},
  })
}

describe('AgentModeSelector', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    const state = createChatState()
    mocks.useChat.mockReturnValue({ state })
    mocks.setAgentMode.mockImplementation((mode: AgentMode) => {
      state.agentMode = mode
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('shows the direct mode tooltip and dismisses it after five seconds', async () => {
    vi.useFakeTimers()
    const onDismissDirectModeTip = vi.fn()

    await act(async () => {
      root.render(<AgentModeSelector showDirectModeTip onDismissDirectModeTip={onDismissDirectModeTip} />)
    })

    const trigger = container.querySelector('button[aria-label="Select agent mode"]') as HTMLButtonElement
    expect(container.textContent).toContain(
      'Prefer fewer questions? Use Direct for more execution and fewer check-ins.'
    )
    expect(trigger.classList.contains('animate-direct-mode-tip')).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(onDismissDirectModeTip).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain(
      'Prefer fewer questions? Use Direct for more execution and fewer check-ins.'
    )
    expect(trigger.classList.contains('animate-direct-mode-tip')).toBe(false)
  })

  it('dismisses the direct mode tooltip when the selector is opened', async () => {
    const onDismissDirectModeTip = vi.fn()

    await act(async () => {
      root.render(<AgentModeSelector showDirectModeTip onDismissDirectModeTip={onDismissDirectModeTip} />)
    })

    const trigger = container.querySelector('button[aria-label="Select agent mode"]') as HTMLButtonElement

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onDismissDirectModeTip).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain(
      'Prefer fewer questions? Use Direct for more execution and fewer check-ins.'
    )
  })
})
