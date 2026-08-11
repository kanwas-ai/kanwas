import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BlockNoteFormattingToolbar } from '@/components/note-editors/BlockNoteFormattingToolbar'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@blocknote/react', () => ({
  FormattingToolbarController: ({ formattingToolbar }: { formattingToolbar: () => React.ReactNode }) => (
    <div data-testid="formatting-toolbar-controller">{formattingToolbar()}</div>
  ),
  FormattingToolbar: ({ children }: { children: React.ReactNode }) => (
    <div className="bn-formatting-toolbar" role="toolbar">
      {children}
    </div>
  ),
  BlockTypeSelect: () => (
    <button type="button" data-testid="block-type-select">
      Heading 1
    </button>
  ),
  blockTypeSelectItems: () => [],
  BasicTextStyleButton: ({ basicTextStyle }: { basicTextStyle: string }) => (
    <button type="button" data-testid={`style-${basicTextStyle}`}>
      {basicTextStyle}
    </button>
  ),
  TextAlignButton: ({ textAlignment }: { textAlignment: string }) => (
    <button type="button" data-testid={`align-${textAlignment}`}>
      {textAlignment}
    </button>
  ),
  ColorStyleButton: () => (
    <button type="button" data-testid="colors">
      Colors
    </button>
  ),
  NestBlockButton: () => (
    <button type="button" data-testid="nest">
      Nest
    </button>
  ),
  UnnestBlockButton: () => (
    <button type="button" data-testid="unnest">
      Unnest
    </button>
  ),
  CreateLinkButton: () => (
    <button type="button" data-testid="create-link">
      Link
    </button>
  ),
}))

vi.mock('@/components/canvas/nodes/SaveSnippetButton', () => ({
  SaveSnippetButton: () => (
    <button type="button" data-testid="save-snippet">
      Save
    </button>
  ),
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  root = null
  container = null
})

function dispatchBubblingEvent(element: Element, type: string) {
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

describe('BlockNoteFormattingToolbar', () => {
  it('keeps toolbar pointer and click events from selecting the parent canvas node', () => {
    const parentPointerDown = vi.fn()
    const parentMouseDown = vi.fn()
    const parentClick = vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <div onPointerDown={parentPointerDown} onMouseDown={parentMouseDown} onClick={parentClick}>
          <BlockNoteFormattingToolbar editor={{ dictionary: {} } as never} documentName="Test note" />
        </div>
      )
    })

    const blockTypeSelect = container.querySelector('[data-testid="block-type-select"]')
    expect(blockTypeSelect).not.toBeNull()

    act(() => {
      dispatchBubblingEvent(blockTypeSelect!, 'pointerdown')
      dispatchBubblingEvent(blockTypeSelect!, 'mousedown')
      dispatchBubblingEvent(blockTypeSelect!, 'click')
    })

    expect(parentPointerDown).not.toHaveBeenCalled()
    expect(parentMouseDown).not.toHaveBeenCalled()
    expect(parentClick).not.toHaveBeenCalled()
  })
})
