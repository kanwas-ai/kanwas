import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createYjsProxy } from 'valtio-y'
import * as Y from 'yjs'

import type { CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { createWorkspaceContentStore } from 'shared/workspace-content-store'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { WorkspaceContext, type WorkspaceContextValue } from '@/providers/workspace/WorkspaceContext'
import { createNoteDoc } from '@/lib/workspaceNoteDoc'
import { WorkspaceUndoController } from '@/lib/workspaceUndo'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface BindingSnapshot {
  editorKey: string
  fragment: Y.XmlFragment | null
  fragmentKey: string
  undoManager: Y.UndoManager
}

function createCanvas(id: string, items: NodeItem[]): CanvasItem {
  return {
    kind: 'canvas',
    id,
    name: '',
    xynode: { id, type: 'canvas', position: { x: 0, y: 0 }, data: {} },
    edges: [],
    items,
  }
}

function createBlockNode(id: string): NodeItem {
  return {
    kind: 'node',
    id,
    name: 'Kanwas',
    xynode: { id, type: 'blockNote', position: { x: 0, y: 0 }, data: {} },
  }
}

function createWorkspaceHarness(noteId: string): { contextValue: WorkspaceContextValue; cleanup: () => void } {
  const yDoc = new Y.Doc()
  const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  act(() => {
    store.root = createCanvas('root', [createBlockNode(noteId)])
  })
  createNoteDoc(yDoc, noteId, 'blockNote')

  const workspaceUndoController = new WorkspaceUndoController(yDoc)
  const contextValue: WorkspaceContextValue = {
    store,
    yDoc,
    provider: {} as WorkspaceContextValue['provider'],
    localUser: { id: 'local-user', name: 'Local User', color: '#111111' },
    contentStore: createWorkspaceContentStore(yDoc),
    workspaceUndoController,
    sharedEditorUndoManager: workspaceUndoController.undoManager as unknown as Y.UndoManager,
    sessionState: 'ready',
    sessionError: null,
    workspaceId: 'workspace-test',
    activeCanvasId: 'root',
    setActiveCanvasId: () => {},
  }

  return {
    contextValue,
    cleanup: () => {
      workspaceUndoController.destroy()
      dispose()
      yDoc.destroy()
    },
  }
}

function BindingHarness({ noteId, onReady }: { noteId: string; onReady: (snapshot: BindingSnapshot) => void }) {
  const binding = useNoteBlockNoteBinding(noteId)

  useEffect(() => {
    onReady({
      editorKey: binding.editorKey,
      fragment: binding.fragment,
      fragmentKey: binding.fragmentKey,
      undoManager: binding.undoManager,
    })
  }, [binding, onReady])

  return null
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null
const pendingCleanups: Array<() => void> = []

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot?.unmount())
  }
  mountedRoot = null

  mountedContainer?.remove()
  mountedContainer = null

  for (const cleanup of pendingCleanups.splice(0)) {
    cleanup()
  }
})

async function renderBinding(
  contextValue: WorkspaceContextValue,
  noteId: string,
  onReady?: (snapshot: BindingSnapshot) => void
): Promise<BindingSnapshot> {
  if (!mountedContainer) {
    mountedContainer = document.createElement('div')
    document.body.appendChild(mountedContainer)
    mountedRoot = createRoot(mountedContainer)
  }

  let snapshot: BindingSnapshot | null = null
  await act(async () => {
    mountedRoot?.render(
      createElement(
        WorkspaceContext.Provider,
        { value: contextValue },
        createElement(BindingHarness, {
          noteId,
          onReady: (nextSnapshot: BindingSnapshot) => {
            snapshot = nextSnapshot
            onReady?.(nextSnapshot)
          },
        })
      )
    )
  })

  if (!snapshot) {
    throw new Error('Binding harness did not produce a snapshot')
  }
  return snapshot
}

describe('note blocknote binding', () => {
  it('uses the shared note fragment and undo manager without a collaboration provider', async () => {
    const noteId = 'kanwas-node'
    const workspace = createWorkspaceHarness(noteId)
    pendingCleanups.push(workspace.cleanup)

    const snapshot = await renderBinding(workspace.contextValue, noteId)

    expect(snapshot.fragment).toBe(workspace.contextValue.contentStore.getBlockNoteFragment(noteId))
    expect(snapshot.undoManager).toBe(workspace.contextValue.sharedEditorUndoManager)
    expect(snapshot.editorKey).toBe(snapshot.fragmentKey)
  })

  it('keeps the editor key and fragment stable across rerenders', async () => {
    const noteId = 'kanwas-node'
    const workspace = createWorkspaceHarness(noteId)
    pendingCleanups.push(workspace.cleanup)

    const first = await renderBinding(workspace.contextValue, noteId)
    const second = await renderBinding(workspace.contextValue, noteId)

    expect(second.editorKey).toBe(first.editorKey)
    expect(second.fragment).toBe(first.fragment)
  })
})
