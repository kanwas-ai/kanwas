import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositionFilesItem } from 'backend/agent'
import { CanvasRepositionTool } from '@/components/chat/CanvasRepositionTool'

const mocks = vi.hoisted(() => ({
  useWorkspaceSnapshot: vi.fn(),
}))

vi.mock('@/providers/workspace', () => ({
  useWorkspaceSnapshot: () => mocks.useWorkspaceSnapshot(),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createRepositionItem(overrides: Partial<RepositionFilesItem> = {}): RepositionFilesItem {
  return {
    id: 'reposition-item-1',
    type: 'reposition_files',
    paths: [],
    status: 'executing',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('CanvasRepositionTool', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  it('shows generic streaming text when paths are not available yet', async () => {
    await act(async () => {
      root.render(React.createElement(CanvasRepositionTool, { item: createRepositionItem(), streaming: true }))
    })

    expect(container.textContent?.replace(/\s+/g, ' ').trim()).toBe('Repositioning files...')
  })
})
