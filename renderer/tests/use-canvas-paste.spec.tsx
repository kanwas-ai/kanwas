import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDocumentCanvasPaste } from '@/hooks/useCanvasPaste'
import { shouldClaimCanvasPaste } from '@/lib/canvasPasteTargeting'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({
  onPaste,
  shouldHandlePaste,
  shouldBypassActiveTextInput,
}: {
  onPaste: (event: ClipboardEvent) => void
  shouldHandlePaste?: () => boolean
  shouldBypassActiveTextInput?: (event: ClipboardEvent) => boolean
}) {
  useDocumentCanvasPaste({ onPaste, shouldHandlePaste, shouldBypassActiveTextInput })
  return null
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null

function mountHarness(props: Parameters<typeof Harness>[0]) {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  act(() => {
    mountedRoot?.render(createElement(Harness, props))
  })
}

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.unmount()
    })
  }

  if (mountedContainer?.parentNode) {
    mountedContainer.parentNode.removeChild(mountedContainer)
  }

  document.body.innerHTML = ''
  mountedRoot = null
  mountedContainer = null
  vi.restoreAllMocks()
})

describe('useDocumentCanvasPaste', () => {
  it('does not call onPaste when the canvas is not active', () => {
    const onPaste = vi.fn()
    mountHarness({ onPaste, shouldHandlePaste: () => false })

    act(() => {
      document.dispatchEvent(new Event('paste'))
    })

    expect(onPaste).not.toHaveBeenCalled()
  })

  it('does not call onPaste while editing an input', () => {
    const onPaste = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    mountHarness({ onPaste, shouldHandlePaste: () => true })

    act(() => {
      document.dispatchEvent(new Event('paste'))
    })

    expect(onPaste).not.toHaveBeenCalled()
  })

  it('can bypass stale text-editor focus when the caller claims the canvas paste', () => {
    const onPaste = vi.fn((event: ClipboardEvent) => event.preventDefault())
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    mountHarness({
      onPaste,
      shouldHandlePaste: () => true,
      shouldBypassActiveTextInput: () => true,
    })

    act(() => {
      document.dispatchEvent(new Event('paste', { cancelable: true }))
    })

    expect(onPaste).toHaveBeenCalledTimes(1)
  })

  it('calls onPaste when the canvas is active and no text input is focused', () => {
    const onPaste = vi.fn()
    mountHarness({ onPaste, shouldHandlePaste: () => true })

    act(() => {
      document.dispatchEvent(new Event('paste'))
    })

    expect(onPaste).toHaveBeenCalledTimes(1)
  })
})

describe('shouldClaimCanvasPaste', () => {
  function createCanvasTarget() {
    const canvas = document.createElement('div')
    canvas.dataset.testid = 'canvas-pane'
    document.body.appendChild(canvas)
    return canvas
  }

  function createBlockNoteEditorTarget() {
    const editor = document.createElement('div')
    editor.className = 'bn-editor'
    editor.setAttribute('contenteditable', 'true')
    document.body.appendChild(editor)
    return editor
  }

  it('claims paste when a stale BlockNote editor is active but the pointer target is blank canvas', () => {
    const editor = createBlockNoteEditorTarget()
    const canvas = createCanvasTarget()

    expect(
      shouldClaimCanvasPaste({
        canvasActive: true,
        activeElement: editor,
        pointerTarget: canvas,
        clipboardHasImportableContent: true,
      })
    ).toBe(true)
  })

  it('does not claim paste when the pointer target is inside a BlockNote editor', () => {
    const editor = createBlockNoteEditorTarget()
    const text = document.createElement('span')
    editor.appendChild(text)

    expect(
      shouldClaimCanvasPaste({
        canvasActive: true,
        activeElement: editor,
        pointerTarget: text,
        clipboardHasImportableContent: true,
      })
    ).toBe(false)
  })

  it('claims paste when an old persisted selection highlight exists but the pointer target is blank canvas', () => {
    const editor = createBlockNoteEditorTarget()
    const persistedHighlight = document.createElement('span')
    persistedHighlight.className = 'persist-selection-highlight'
    editor.appendChild(persistedHighlight)
    const canvas = createCanvasTarget()

    expect(
      shouldClaimCanvasPaste({
        canvasActive: true,
        activeElement: editor,
        pointerTarget: canvas,
        clipboardHasImportableContent: true,
      })
    ).toBe(true)
  })

  it('does not claim paste from a normal focused input', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const canvas = createCanvasTarget()

    expect(
      shouldClaimCanvasPaste({
        canvasActive: true,
        activeElement: input,
        pointerTarget: canvas,
        clipboardHasImportableContent: true,
      })
    ).toBe(false)
  })
})
