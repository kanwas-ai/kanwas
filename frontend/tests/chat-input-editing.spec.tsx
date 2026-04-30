import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxy } from 'valtio'
import type { UserMessageItem } from 'backend/agent'
import { ChatInput } from '@/components/chat/ChatInput'
import { UserMessage } from '@/components/chat/UserMessage'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const workspaceStore = proxy({ root: null })
const setTextSelection = vi.fn()
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

function emptyRect() {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function emptyRectList() {
  return [] as unknown as DOMRectList
}

vi.mock('@/providers/workspace', () => ({
  useWorkspace: () => ({ store: workspaceStore, activeCanvasId: null }),
  useTextSelection: () => ({ textSelection: null, setTextSelection }),
}))

vi.mock('@/providers/chat/hooks', () => ({
  useInterruptAgent: () => vi.fn(),
  useStartNewTask: () => vi.fn(),
}))

vi.mock('@/providers/keyboard', () => ({
  useKeyboardShortcut: () => undefined,
}))

vi.mock('@/hooks/useSkillsApi', () => ({
  useSkills: () => ({ data: [] }),
}))

vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: () => ({
    isRecording: false,
    isTranscribing: false,
    isSupported: false,
    toggleRecording: vi.fn(),
    analyserRef: { current: null },
  }),
}))

vi.mock('@/components/ui/ResizeHandle/ResizeHandle', () => ({
  ResizeHandle: () => null,
}))

vi.mock('@/components/ui/ResizeHandle/useResize', () => ({
  useResize: () => ({
    isResizing: false,
    resizeRef: { current: null },
    handleMouseDown: vi.fn(),
  }),
}))

function createUserMessageItem(): UserMessageItem {
  return {
    id: 'user-1',
    type: 'user_message',
    message: 'Refine @Alpha\nSecond line',
    timestamp: Date.now(),
    invocationId: 'invocation-1',
    mentions: [{ id: 'node-1', label: 'Alpha' }],
  }
}

function ChatEditHarness({ onSubmit }: { onSubmit: ReturnType<typeof vi.fn> }) {
  const [files, setFiles] = useState<File[]>([])
  const [editSession, setEditSession] = useState<{
    id: string
    label: string
    message: string
    mentions?: UserMessageItem['mentions']
  } | null>(null)
  const item = createUserMessageItem()

  return (
    <div>
      <UserMessage
        item={item}
        canEdit
        onEdit={(message) => {
          setEditSession({
            id: `${message.id}:${message.invocationId}`,
            label: message.message,
            message: message.message,
            mentions: message.mentions?.map((mention) => ({ id: mention.id, label: mention.label })),
          })
        }}
      />
      <ChatInput
        workspaceId="workspace-1"
        onSubmit={onSubmit}
        isProcessing={false}
        hasPendingQuestion={false}
        files={files}
        onFilesChange={setFiles}
        selectedNodeIds={[]}
        editSession={editSession}
        onCancelEdit={() => setEditSession(null)}
      />
    </div>
  )
}

describe('chat input edit mode', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    setTextSelection.mockReset()
    localStorageMock.getItem.mockReset()
    localStorageMock.getItem.mockReturnValue(null)
    localStorageMock.setItem.mockReset()
    localStorageMock.removeItem.mockReset()
    localStorageMock.clear.mockReset()

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })

    HTMLElement.prototype.scrollIntoView = vi.fn()
    Range.prototype.getClientRects = emptyRectList
    Range.prototype.getBoundingClientRect = emptyRect
    Text.prototype.getClientRects = emptyRectList
    Text.prototype.getBoundingClientRect = emptyRect

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

  it('prefills the composer from an edit action and preserves mentions on submit', async () => {
    const onSubmit = vi.fn()

    await act(async () => {
      root.render(<ChatEditHarness onSubmit={onSubmit} />)
    })

    const editButton = container.querySelector('button[aria-label="Edit message"]') as HTMLButtonElement
    expect(editButton).toBeTruthy()

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Editing previous message')

    const editor = container.querySelector('.ProseMirror') as HTMLElement
    expect(editor.textContent).toContain('Refine @Alpha')
    expect(editor.textContent).toContain('Second line')

    const form = container.querySelector('#chat-input-form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith('Refine @Alpha\nSecond line', [], [{ id: 'node-1', label: 'Alpha' }], null)
    expect(container.textContent).not.toContain('Editing previous message')
    expect((container.querySelector('.ProseMirror') as HTMLElement).textContent?.trim()).toBe('')
  })

  it('cancels edit mode and clears the injected draft', async () => {
    const onSubmit = vi.fn()

    await act(async () => {
      root.render(<ChatEditHarness onSubmit={onSubmit} />)
    })

    const editButton = container.querySelector('button[aria-label="Edit message"]') as HTMLButtonElement

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const cancelButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel'
    )
    expect(cancelButton).toBeTruthy()

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain('Editing previous message')
    expect((container.querySelector('.ProseMirror') as HTMLElement).textContent?.trim()).toBe('')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
