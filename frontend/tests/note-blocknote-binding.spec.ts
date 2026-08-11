import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Awareness } from 'y-protocols/awareness'
import { createYjsProxy } from 'valtio-y'
import * as Y from 'yjs'

import type { CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { createWorkspaceContentStore } from 'shared/workspace-content-store'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { WorkspaceContext, type WorkspaceContextValue } from '@/providers/workspace/WorkspaceContext'
import { createNoteDoc, deleteNoteDoc, getNoteDoc } from '@/lib/workspaceNoteDoc'
import { WorkspaceUndoController } from '@/lib/workspaceUndo'
import type { UserIdentity } from '@/lib/userIdentity'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface BindingSnapshot {
  awareness: Awareness
  awarenessSource: 'note' | 'isolated'
  editorKey: string
  fragment: Y.XmlFragment | null
  fragmentKey: string
  undoManager: Y.UndoManager
}

interface WorkspaceHarness {
  contextValue: WorkspaceContextValue
  cleanup: () => void
  providerCalls: {
    acquire: string[]
    release: string[]
  }
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

function createWorkspaceHarness(noteId: string, noteAwareness: Awareness): WorkspaceHarness {
  const yDoc = new Y.Doc()
  const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  act(() => {
    store.root = createCanvas('root', '', [createBlockNode(noteId, 'Kanwas')])
  })

  createNoteDoc(yDoc, noteId, 'blockNote')

  const workspaceUndoController = new WorkspaceUndoController(yDoc)
  const workspaceProviderAwareness = new Awareness(yDoc)
  const providerCalls = {
    acquire: [] as string[],
    release: [] as string[],
  }
  const localUser: UserIdentity = {
    id: 'local-user',
    name: 'Local User',
    color: '#111111',
  }
  const acquiredNoteCounts = new Map<string, number>()

  const contextValue: WorkspaceContextValue = {
    store,
    yDoc,
    provider: {
      acquireNoteAwareness(requestedNoteId: string) {
        if (!getNoteDoc(yDoc, requestedNoteId)) {
          throw new Error(`Unknown workspace note ${requestedNoteId}`)
        }

        providerCalls.acquire.push(requestedNoteId)
        acquiredNoteCounts.set(requestedNoteId, (acquiredNoteCounts.get(requestedNoteId) ?? 0) + 1)
        return noteAwareness
      },
      awareness: workspaceProviderAwareness,
      getNoteAwareness(requestedNoteId: string) {
        return requestedNoteId === noteId &&
          getNoteDoc(yDoc, requestedNoteId) &&
          (acquiredNoteCounts.get(requestedNoteId) ?? 0) > 0
          ? noteAwareness
          : undefined
      },
      releaseNoteAwareness(requestedNoteId: string) {
        providerCalls.release.push(requestedNoteId)
        acquiredNoteCounts.set(requestedNoteId, Math.max(0, (acquiredNoteCounts.get(requestedNoteId) ?? 0) - 1))
      },
    } as WorkspaceContextValue['provider'],
    localUser,
    acquireCursorPresenceSuppression: () => () => {},
    isCursorPresenceSuppressed: () => false,
    contentStore: createWorkspaceContentStore(yDoc),
    workspaceUndoController,
    sharedEditorUndoManager: workspaceUndoController.undoManager as unknown as Y.UndoManager,
    hasInitiallySynced: true,
    initialSyncError: null,
    isConnected: true,
    isReconnecting: false,
    disconnectReason: null,
    workspaceId: 'workspace-test',
    activeCanvasId: 'root',
    setActiveCanvasId: () => {},
  }

  return {
    contextValue,
    providerCalls,
    cleanup: () => {
      workspaceUndoController.destroy()
      workspaceProviderAwareness.destroy()
      dispose()
      yDoc.destroy()
    },
  }
}

function BindingHarness({
  noteId,
  onReady,
  options,
}: {
  noteId: string
  onReady: (snapshot: BindingSnapshot) => void
  options?: { awareness?: 'note' | 'isolated'; awarenessEnabled?: boolean }
}) {
  const binding = useNoteBlockNoteBinding(noteId, options)

  useEffect(() => {
    onReady({
      awareness: binding.collaborationProvider.awareness,
      awarenessSource: binding.awarenessSource,
      editorKey: binding.editorKey,
      fragment: binding.fragment,
      fragmentKey: binding.fragmentKey,
      undoManager: binding.undoManager,
    })
  }, [binding, onReady])

  return null
}

function DoubleBindingHarness({
  noteId,
  onReady,
  options,
}: {
  noteId: string
  onReady: (snapshots: [BindingSnapshot, BindingSnapshot]) => void
  options?: { awareness?: 'note' | 'isolated'; awarenessEnabled?: boolean }
}) {
  const first = useNoteBlockNoteBinding(noteId, options)
  const second = useNoteBlockNoteBinding(noteId, options)

  useEffect(() => {
    onReady([
      {
        awareness: first.collaborationProvider.awareness,
        awarenessSource: first.awarenessSource,
        editorKey: first.editorKey,
        fragment: first.fragment,
        fragmentKey: first.fragmentKey,
        undoManager: first.undoManager,
      },
      {
        awareness: second.collaborationProvider.awareness,
        awarenessSource: second.awarenessSource,
        editorKey: second.editorKey,
        fragment: second.fragment,
        fragmentKey: second.fragmentKey,
        undoManager: second.undoManager,
      },
    ])
  }, [first, onReady, second])

  return null
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null
let pendingCleanups: Array<() => void> = []

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

  for (const cleanup of pendingCleanups.splice(0)) {
    cleanup()
  }
})

async function renderBindingHarness(
  contextValue: WorkspaceContextValue,
  noteId: string,
  options?: { awareness?: 'note' | 'isolated'; awarenessEnabled?: boolean }
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
          options,
          onReady: (nextSnapshot: BindingSnapshot) => {
            snapshot = nextSnapshot
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

async function renderDoubleBindingHarness(
  contextValue: WorkspaceContextValue,
  noteId: string,
  options?: { awareness?: 'note' | 'isolated'; awarenessEnabled?: boolean }
): Promise<[BindingSnapshot, BindingSnapshot]> {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  let snapshots: [BindingSnapshot, BindingSnapshot] | null = null

  await act(async () => {
    mountedRoot?.render(
      createElement(
        WorkspaceContext.Provider,
        { value: contextValue },
        createElement(DoubleBindingHarness, {
          noteId,
          options,
          onReady: (nextSnapshots: [BindingSnapshot, BindingSnapshot]) => {
            snapshots = nextSnapshots
          },
        })
      )
    )
  })

  if (!snapshots) {
    throw new Error('Double binding harness did not produce snapshots')
  }

  return snapshots
}

describe('note blocknote binding', () => {
  it('uses shared note awareness when awareness is enabled', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    const snapshot = await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: true })
    const fragment = workspace.contextValue.contentStore.getBlockNoteFragment(noteId)

    expect(fragment).not.toBeNull()
    expect(snapshot.fragment).toBe(fragment)
    expect(snapshot.awareness).toBe(noteAwareness)
    expect(snapshot.awarenessSource).toBe('note')
    expect(snapshot.undoManager).toBe(workspace.contextValue.sharedEditorUndoManager)
    expect(workspace.providerCalls.acquire).toEqual([noteId])
  })

  it('uses isolated awareness and never acquires shared awareness when disabled', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    const snapshot = await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: false })
    const fragment = workspace.contextValue.contentStore.getBlockNoteFragment(noteId)

    expect(fragment).not.toBeNull()
    expect(snapshot.fragment).toBe(fragment)
    expect(snapshot.awareness).not.toBe(noteAwareness)
    expect(snapshot.awareness).toBeInstanceOf(Awareness)
    expect(snapshot.awarenessSource).toBe('isolated')
    expect(snapshot.undoManager).toBe(workspace.contextValue.sharedEditorUndoManager)
    expect(workspace.providerCalls.acquire).toEqual([])
    expect(workspace.providerCalls.release).toEqual([])
  })

  it('switches awareness source and remount key when activation changes', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    const inactiveSnapshot = await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: false })
    const activeSnapshot = await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: true })

    expect(inactiveSnapshot.awarenessSource).toBe('isolated')
    expect(activeSnapshot.awarenessSource).toBe('note')
    expect(activeSnapshot.awareness).toBe(noteAwareness)
    expect(activeSnapshot.editorKey).not.toBe(inactiveSnapshot.editorKey)
    expect(activeSnapshot.fragmentKey).toBe(inactiveSnapshot.fragmentKey)
    expect(workspace.providerCalls.acquire).toEqual([noteId])
  })

  it('releases shared awareness on unmount', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: true })

    act(() => {
      mountedRoot?.unmount()
    })
    mountedRoot = null

    expect(workspace.providerCalls.acquire).toEqual([noteId])
    expect(workspace.providerCalls.release).toEqual([noteId])
  })

  it('ref-counts two active consumers of the same note', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    const [firstSnapshot, secondSnapshot] = await renderDoubleBindingHarness(workspace.contextValue, noteId, {
      awarenessEnabled: true,
    })

    expect(firstSnapshot.awareness).toBe(noteAwareness)
    expect(secondSnapshot.awareness).toBe(noteAwareness)
    expect(firstSnapshot.awarenessSource).toBe('note')
    expect(secondSnapshot.awarenessSource).toBe('note')
    expect(workspace.providerCalls.acquire).toEqual([noteId, noteId])

    act(() => {
      mountedRoot?.unmount()
    })
    mountedRoot = null

    expect(workspace.providerCalls.release).toEqual([noteId, noteId])
  })

  it('releases shared awareness without reacquiring when the note doc is deleted', async () => {
    const noteId = 'kanwas-node'
    const noteAwarenessDoc = new Y.Doc()
    const noteAwareness = new Awareness(noteAwarenessDoc)
    const workspace = createWorkspaceHarness(noteId, noteAwareness)
    pendingCleanups.push(() => {
      workspace.cleanup()
      noteAwareness.destroy()
      noteAwarenessDoc.destroy()
    })

    await renderBindingHarness(workspace.contextValue, noteId, { awarenessEnabled: true })

    await act(async () => {
      deleteNoteDoc(workspace.contextValue.yDoc, noteId)
    })

    expect(workspace.providerCalls.acquire).toEqual([noteId])
    expect(workspace.providerCalls.release).toEqual([noteId])
  })
})
