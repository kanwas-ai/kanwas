import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextEditorTool } from '@/components/chat/TextEditorTool'
import type { TextEditorItem } from 'backend/agent'
import type { CanvasItem, NodeItem } from 'shared/path-mapper'

const mocks = vi.hoisted(() => ({
  useWorkspaceSnapshot: vi.fn(),
}))

vi.mock('@/providers/workspace', () => ({
  useWorkspaceSnapshot: () => mocks.useWorkspaceSnapshot(),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createNode(id: string, name: string): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    } as NodeItem['xynode'],
  }
}

function createCanvas(id: string, name: string, items: Array<NodeItem | CanvasItem> = []): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name,
    xynode: {
      id,
      type: 'canvas',
      position: { x: 0, y: 0 },
      data: {},
    },
    edges: [],
    items,
  }
}

function createWorkspaceRoot(items: Array<NodeItem | CanvasItem>): CanvasItem {
  return createCanvas('root', '', items)
}

function createTextEditorItem(path: string, overrides: Partial<TextEditorItem> = {}): TextEditorItem {
  return {
    id: 'text-editor-item-1',
    type: 'text_editor',
    command: 'view',
    path,
    status: 'completed',
    timestamp: Date.now(),
    ...overrides,
  }
}

function normalizedTextContent(element: Element) {
  return element.textContent?.replace(/\s+/g, ' ').trim()
}

describe('TextEditorTool workspace path links', () => {
  let root: Root
  let container: HTMLDivElement

  async function renderTool(
    item: TextEditorItem,
    onNodeSelect?: (nodeId: string, canvasId: string) => void,
    streaming = false
  ) {
    await act(async () => {
      root.render(React.createElement(TextEditorTool, { item, onNodeSelect, streaming }))
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders a clickable filename when a spaced workspace path resolves', async () => {
    const workspaceRoot = createWorkspaceRoot([
      createCanvas('planning-board', 'Planning Board', [createNode('node-1', 'My File')]),
    ])
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: workspaceRoot })

    const onNodeSelect = vi.fn()
    await renderTool(createTextEditorItem('/workspace/Planning Board/My File.md'), onNodeSelect)

    const button = container.querySelector('button') as HTMLButtonElement | null
    expect(button).toBeTruthy()
    expect(button?.textContent).toBe('My File.md')
    expect(button?.className).toContain('truncate')

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })

    expect(onNodeSelect).toHaveBeenCalledWith('node-1', 'planning-board')
  })

  it('does not render a clickable filename when path cannot be resolved', async () => {
    const workspaceRoot = createWorkspaceRoot([
      createCanvas('planning-board', 'Planning Board', [createNode('node-1', 'My File')]),
    ])
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: workspaceRoot })

    const onNodeSelect = vi.fn()
    await renderTool(createTextEditorItem('/workspace/Planning Board/Missing File.md'), onNodeSelect)

    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).toContain('Missing File.md')
    expect(onNodeSelect).not.toHaveBeenCalled()
  })

  it('renders filename in its own truncation region for long unresolved paths', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/research/competitive-analysis/deeply-nested-user-research/insights.md', {
        totalLines: 24,
      })
    )

    const filename = container.querySelector('.text-chat-link.font-medium') as HTMLSpanElement | null
    expect(filename?.textContent).toBe('insights.md')
    expect(filename?.className).toContain('truncate')
    expect(container.textContent).toContain('24 lines')
  })

  it('shows line-count details (not verbose writing status) for executing write commands', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/Release Notes.md', {
        command: 'create',
        status: 'executing',
        totalLines: 12,
        streamingStatus: 'Writing "Release Notes"...',
      })
    )

    expect(container.textContent).toContain('12 lines')
    expect(container.textContent).not.toContain('Writing')
  })

  it('keeps streaming progress text for executing view commands', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/Release Notes.md', {
        command: 'view',
        status: 'executing',
        totalLines: 12,
        streamingStatus: 'Reading file...',
      })
    )

    expect(container.textContent).toContain('Reading file...')
  })

  it('renders metadata.yaml reads as a canvas structure read', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/metadata.yaml', {
        command: 'view',
        totalLines: 12,
        streamingStatus: 'Reading file...',
      })
    )

    expect(normalizedTextContent(container)).toBe('Read Reading canvas structure')
    expect(container.textContent).not.toContain('metadata.yaml')
    expect(container.querySelector('i')?.className).toContain('fa-eye')
  })

  it('renders streaming metadata.yaml reads as a canvas structure read', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/metadata.yaml', {
        command: 'view',
        status: 'executing',
        totalLines: 12,
      }),
      undefined,
      true
    )

    expect(normalizedTextContent(container)).toBe('Read Reading canvas structure')
    expect(container.textContent).not.toContain('metadata.yaml')
    expect(container.querySelector('i')?.className).toContain('fa-eye')
  })

  it('renders sticky note yaml reads as semantic node labels with folder context', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(createTextEditorItem('/workspace/Planning Board/Customer quote.sticky.yaml'))

    expect(normalizedTextContent(container)).toBe('Read sticky note "Customer quote" in Planning Board')
    expect(container.textContent).not.toContain('.sticky.yaml')
    expect(container.querySelector('i')?.className).toContain('fa-eye')
  })

  it('renders link yaml creates as semantic node labels with folder context', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Research/Pricing page.url.yaml', {
        command: 'create',
        totalLines: 6,
      })
    )

    expect(normalizedTextContent(container)).toBe('Write link "Pricing page" in Research')
    expect(container.textContent).not.toContain('.url.yaml')
    expect(container.textContent).not.toContain('6 lines')
    expect(container.querySelector('i')?.className).toContain('fa-pen')
  })

  it('renders streaming sticky note yaml edits as semantic node labels with folder context', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Ideas/Follow-up.sticky.yaml', {
        command: 'str_replace',
        status: 'executing',
      }),
      undefined,
      true
    )

    expect(normalizedTextContent(container)).toBe('Edit sticky note "Follow-up" in Ideas')
    expect(container.textContent).not.toContain('.sticky.yaml')
    expect(container.querySelector('i')?.className).toContain('fa-pen')
  })

  it('uses workspace as the folder for root-level semantic yaml nodes', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Home.url.yaml', {
        command: 'view',
      })
    )

    expect(normalizedTextContent(container)).toBe('Read link "Home" in workspace')
    expect(container.textContent).not.toContain('.url.yaml')
  })

  it('renders delete operations with a delete verb', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/Old Notes.md', {
        command: 'delete',
      })
    )

    expect(container.textContent).toContain('Delete')
    expect(container.textContent).toContain('Old Notes.md')
  })

  it('shows the simplified failure message and hides raw edit_file errors', async () => {
    mocks.useWorkspaceSnapshot.mockReturnValue({ root: null })

    await renderTool(
      createTextEditorItem('/workspace/Planning Board/Overview.md', {
        command: 'str_replace',
        status: 'failed',
        error: 'Could not edit the file because the exact target text was not found. Read the file again and retry.',
        rawError: 'Exact match not found.',
      })
    )

    expect(container.textContent).toContain(
      'Could not edit the file because the exact target text was not found. Read the file again and retry.'
    )
    expect(container.textContent).not.toContain('Exact match not found.')
  })
})
