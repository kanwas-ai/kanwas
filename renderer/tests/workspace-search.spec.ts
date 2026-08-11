import { act, createElement, useEffect, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import type { CanvasItem, NodeItem } from 'shared'
import { createWorkspaceContentStore } from 'shared/workspace-content-store'
import { useWorkspaceSearch, type SearchResult } from '@/hooks/useWorkspaceSearch'
import { createNoteDoc, ensureWorkspaceNotesMap, NOTE_SCHEMA_VERSION } from '@/lib/workspaceNoteDoc'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface SearchHarnessApi {
  search: (query: string) => SearchResult[]
  getAllItems: () => SearchResult[]
}

function createCanvas(id: string, name: string, items: Array<NodeItem | CanvasItem>): CanvasItem {
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

function createBlockNode(id: string, name: string): NodeItem {
  return {
    kind: 'node',
    id,
    name,
    xynode: {
      id,
      type: 'blockNote',
      position: { x: 0, y: 0 },
      data: {},
    },
  }
}

function setBlockNoteFragmentText(fragment: Y.XmlFragment, text: string): void {
  const existingChildren = fragment.toArray()
  if (existingChildren.length > 0) {
    fragment.delete(0, existingChildren.length)
  }

  const paragraph = new Y.XmlElement('paragraph')
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  paragraph.insert(0, [textNode])
  fragment.insert(0, [paragraph])
}

function createDetachedNoteDoc(noteId: string, text: string): Y.Doc {
  const noteDoc = new Y.Doc({ guid: noteId })

  noteDoc.transact(() => {
    const meta = noteDoc.getMap('meta')
    meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
    meta.set('noteId', noteId)
    meta.set('contentKind', 'blockNote')
    setBlockNoteFragmentText(noteDoc.getXmlFragment('content'), text)
  })

  return noteDoc
}

function SearchHarness({
  rootCanvas,
  yDoc,
  onReady,
}: {
  rootCanvas: CanvasItem
  yDoc: Y.Doc
  onReady: (api: SearchHarnessApi) => void
}) {
  const contentStore = useMemo(() => createWorkspaceContentStore(yDoc), [yDoc])
  const { search, getAllItems } = useWorkspaceSearch(rootCanvas, yDoc, contentStore, true)

  useEffect(() => {
    onReady({ search, getAllItems })
  }, [search, getAllItems, onReady])

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

async function renderSearchHarness(rootCanvas: CanvasItem, yDoc: Y.Doc): Promise<SearchHarnessApi> {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  let api: SearchHarnessApi | null = null

  await act(async () => {
    mountedRoot?.render(
      createElement(SearchHarness, {
        rootCanvas,
        yDoc,
        onReady: (nextApi: SearchHarnessApi) => {
          api = nextApi
        },
      })
    )
  })

  if (!api) {
    throw new Error('Search harness API was not initialized')
  }

  return api
}

describe('workspace search', () => {
  it('reindexes when a note doc is replaced in the notes map', async () => {
    const nodeId = 'search-node'
    const yDoc = new Y.Doc()
    const rootCanvas = createCanvas('root', '', [createBlockNode(nodeId, 'Roadmap')])

    const originalNoteDoc = createNoteDoc(yDoc, nodeId, 'blockNote')
    setBlockNoteFragmentText(originalNoteDoc.getXmlFragment('content'), 'alpha launch plan')

    const api = await renderSearchHarness(rootCanvas, yDoc)

    expect(api.search('alpha').map((result) => result.id)).toContain(nodeId)

    const replacementDoc = createDetachedNoteDoc(nodeId, 'beta migration checklist')

    act(() => {
      ensureWorkspaceNotesMap(yDoc).set(nodeId, replacementDoc)
    })

    expect(api.search('beta').map((result) => result.id)).toContain(nodeId)
    expect(api.search('alpha')).toHaveLength(0)
  })
})
