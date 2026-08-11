import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBlockNoteCollaborationUserInfo } from '@/hooks/useBlockNoteCollaborationUserInfo'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({
  editor,
  name,
  color,
}: {
  editor: { updateCollaborationUserInfo: (user: { name: string; color: string }) => void }
  name: string
  color: string
}) {
  useBlockNoteCollaborationUserInfo(editor, { name, color })
  return null
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null

afterEach(() => {
  if (mountedRoot) {
    act(() => {
      mountedRoot?.unmount()
    })
  }

  if (mountedContainer?.parentNode) {
    mountedContainer.parentNode.removeChild(mountedContainer)
  }

  mountedRoot = null
  mountedContainer = null
})

describe('useBlockNoteCollaborationUserInfo', () => {
  it('syncs the latest collaboration label', () => {
    const updateCollaborationUserInfo = vi.fn()
    const editor = { updateCollaborationUserInfo }

    mountedContainer = document.createElement('div')
    document.body.appendChild(mountedContainer)
    mountedRoot = createRoot(mountedContainer)

    act(() => {
      mountedRoot?.render(createElement(Harness, { editor, name: 'Jane Doe', color: '#112233' }))
    })

    expect(updateCollaborationUserInfo).toHaveBeenLastCalledWith({
      name: 'Jane Doe',
      color: '#112233',
    })

    act(() => {
      mountedRoot?.render(createElement(Harness, { editor, name: 'Janet Doe', color: '#112233' }))
    })

    expect(updateCollaborationUserInfo).toHaveBeenLastCalledWith({
      name: 'Janet Doe',
      color: '#112233',
    })
  })
})
