import React, { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarvinMenu } from '@/components/ui/MarvinMenu/MarvinMenu'
import { useMarvinConfig } from '@/hooks/useMarvinConfig'
import { useWorkspace } from '@/providers/workspace'

vi.mock('@/providers/workspace', () => ({
  useWorkspace: vi.fn(),
}))

vi.mock('@/hooks/useMarvinConfig', () => ({
  useMarvinConfig: vi.fn(),
}))

vi.mock('@/components/ui/MarvinMenu/DebugTerminal', () => ({
  DebugTerminal: ({ workspaceId }: { workspaceId: string }) =>
    createElement('div', null, `Debug terminal ${workspaceId}`),
}))

const mockedUseWorkspace = vi.mocked(useWorkspace)
const mockedUseMarvinConfig = vi.mocked(useMarvinConfig)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MarvinMenu', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(async () => {
    vi.clearAllMocks()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedUseWorkspace.mockReturnValue({
      workspaceId: 'workspace-12345678',
    } as never)

    mockedUseMarvinConfig.mockReturnValue({
      config: {},
      defaults: {},
      workspaceId: 'workspace-12345678',
      isLoading: false,
      error: null,
      updateConfig: vi.fn(),
      isUpdating: false,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('shows an empty settings state when Marvin has no configurable options', async () => {
    await act(async () => {
      root.render(createElement(MarvinMenu, { isOpen: true, onClose: () => undefined, timeline: [] }))
    })

    const settingsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Settings')
    )

    expect(settingsButton).toBeTruthy()

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('No Marvin settings available')
    expect(container.textContent).toContain('System prompt editing has been removed')
  })
})
