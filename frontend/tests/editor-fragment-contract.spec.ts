import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { useNoteBlockNoteFragment } from '@/hooks/useNoteContent'
import { useFragmentKey } from '@/hooks/useFragmentKey'
import { createNoteDoc, deleteNoteDoc, ensureWorkspaceNotesMap } from '@/lib/workspaceNoteDoc'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface RenderStats {
  mountCount: number
  unmountCount: number
  renderCount: number
  lastKey: string | null
  lastFragment: Y.XmlFragment | null
}

function MountCounter({ stats }: { stats: RenderStats }) {
  useEffect(() => {
    stats.mountCount += 1
    return () => {
      stats.unmountCount += 1
    }
  }, [stats])

  return null
}

function FragmentContractHarness({ yDoc, nodeId, stats }: { yDoc: Y.Doc; nodeId: string; stats: RenderStats }) {
  const fallbackFragment = new Y.XmlFragment()
  const fragment = useNoteBlockNoteFragment(yDoc, nodeId)
  const fragmentKey = useFragmentKey(fragment ?? fallbackFragment)

  stats.renderCount += 1
  stats.lastKey = fragmentKey
  stats.lastFragment = fragment

  if (!fragment) {
    return null
  }

  return createElement(MountCounter, { key: fragmentKey, stats })
}

function initializeReplacementDoc(noteId: string): Y.Doc {
  const noteDoc = new Y.Doc({ guid: noteId })
  const meta = noteDoc.getMap('meta')
  meta.set('schemaVersion', 1)
  meta.set('noteId', noteId)
  meta.set('contentKind', 'blockNote')
  noteDoc.getXmlFragment('content')
  return noteDoc
}

describe('editor fragment identity/remount contract', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    root = null

    if (container?.parentNode) {
      container.parentNode.removeChild(container)
    }
    container = null
  })

  it('keeps fragment key and mount count stable for in-place updates', () => {
    const yDoc = new Y.Doc()
    const nodeId = 'node-1'
    const noteDoc = createNoteDoc(yDoc, nodeId, 'blockNote')
    const initialFragment = noteDoc.getXmlFragment('content')

    const stats: RenderStats = {
      mountCount: 0,
      unmountCount: 0,
      renderCount: 0,
      lastKey: null,
      lastFragment: null,
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    const initialKey = stats.lastKey

    act(() => {
      const paragraph = new Y.XmlElement('paragraph')
      initialFragment.insert(0, [paragraph])
    })

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    expect(stats.lastFragment).toBe(initialFragment)
    expect(stats.lastKey).toBe(initialKey)
    expect(stats.mountCount).toBe(1)
    expect(stats.unmountCount).toBe(0)
  })

  it('remounts when note doc identity is replaced', () => {
    const yDoc = new Y.Doc()
    const nodeId = 'node-2'
    createNoteDoc(yDoc, nodeId, 'blockNote')

    const stats: RenderStats = {
      mountCount: 0,
      unmountCount: 0,
      renderCount: 0,
      lastKey: null,
      lastFragment: null,
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    const initialKey = stats.lastKey
    const replacementDoc = initializeReplacementDoc(nodeId)
    const replacementFragment = replacementDoc.getXmlFragment('content')

    act(() => {
      ensureWorkspaceNotesMap(yDoc).set(nodeId, replacementDoc)
    })

    expect(stats.lastFragment).toBe(replacementFragment)
    expect(stats.lastKey).not.toBe(initialKey)
    expect(stats.mountCount).toBe(2)
    expect(stats.unmountCount).toBe(1)
  })

  it('resolves an attached note doc after it becomes ready', async () => {
    const yDoc = new Y.Doc()
    const nodeId = 'node-late-bootstrap'
    const noteDoc = new Y.Doc({ guid: nodeId })

    act(() => {
      ensureWorkspaceNotesMap(yDoc).set(nodeId, noteDoc)
    })

    const stats: RenderStats = {
      mountCount: 0,
      unmountCount: 0,
      renderCount: 0,
      lastKey: null,
      lastFragment: null,
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    expect(stats.lastFragment).toBeNull()
    expect(stats.mountCount).toBe(0)

    await act(async () => {
      const meta = noteDoc.getMap('meta')
      meta.set('schemaVersion', 1)
      meta.set('noteId', nodeId)
      meta.set('contentKind', 'blockNote')
      noteDoc.getXmlFragment('content')
      await Promise.resolve()
    })

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    expect(stats.lastFragment).toBe(noteDoc.getXmlFragment('content'))
    expect(stats.mountCount).toBe(1)
    expect(stats.unmountCount).toBe(0)
  })

  it('does not recreate a note doc when it is deleted before unmount', () => {
    const yDoc = new Y.Doc()
    const nodeId = 'node-3'
    const noteDoc = createNoteDoc(yDoc, nodeId, 'blockNote')
    const initialFragment = noteDoc.getXmlFragment('content')

    const stats: RenderStats = {
      mountCount: 0,
      unmountCount: 0,
      renderCount: 0,
      lastKey: null,
      lastFragment: null,
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(createElement(FragmentContractHarness, { yDoc, nodeId, stats }))
    })

    const initialKey = stats.lastKey

    act(() => {
      deleteNoteDoc(yDoc, nodeId)
    })

    expect(ensureWorkspaceNotesMap(yDoc).has(nodeId)).toBe(false)
    expect(stats.lastFragment).toBe(initialFragment)
    expect(stats.lastKey).toBe(initialKey)
    expect(stats.mountCount).toBe(1)
    expect(stats.unmountCount).toBe(0)
  })
})
