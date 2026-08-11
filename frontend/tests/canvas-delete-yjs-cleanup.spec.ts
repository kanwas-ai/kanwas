import { act, createElement, useContext, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { NodeChange } from '@xyflow/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createYjsProxy, VALTIO_Y_ORIGIN } from 'valtio-y'
import * as Y from 'yjs'

import { createWorkspaceContentStore, type CanvasItem, type NodeItem, type WorkspaceDocument } from 'shared'
import { WorkspaceContext, type WorkspaceContextValue } from '@/providers/workspace/WorkspaceContext'
import { useDeleteNode, useDeleteTreeItem } from '@/components/canvas/hooks'
import { deleteCanvasItemsFromCanvas, getDeletableCanvasItems } from '@/components/canvas/deleteCanvasItems'
import { useCanvasDeletion } from '@/components/canvas/useCanvasDeletion'
import { deleteNoteDocsForRemovedItems, rememberDeletedNoteDocsForRemovedItems } from '@/lib/workspaceNoteLifecycle'
import { WorkspaceUndoController, WORKSPACE_NOTE_COMMAND_ORIGIN } from '@/lib/workspaceUndo'
import { createNoteDoc, getNoteDoc, NOTE_SCHEMA_VERSION } from '@/lib/workspaceNoteDoc'
import type { UserIdentity } from '@/lib/userIdentity'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface HarnessApi {
  confirmCanvasDelete: () => void
  deleteNode: (nodeId: string, canvasId: string) => void
  deleteTreeItem: (itemId: string) => void
  queueCanvasDelete: (nodeIds: string | string[]) => void
}

interface TestWorkspace {
  yDoc: Y.Doc
  store: WorkspaceDocument
  contextValue: WorkspaceContextValue
  undoController: WorkspaceUndoController
  dispose: () => void
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

function initializeBlockNoteDoc(noteDoc: Y.Doc, noteId: string, text: string): void {
  noteDoc.transact(() => {
    const meta = noteDoc.getMap('meta')
    meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
    meta.set('noteId', noteId)
    meta.set('contentKind', 'blockNote')
    setBlockNoteFragmentText(noteDoc.getXmlFragment('content'), text)
  })
}

function updateBlockNoteText(noteDoc: Y.Doc, text: string): void {
  noteDoc.transact(() => {
    setBlockNoteFragmentText(noteDoc.getXmlFragment('content'), text)
  }, WORKSPACE_NOTE_COMMAND_ORIGIN)
}

function readBlockNoteText(noteDoc: Y.Doc): string {
  return noteDoc.getXmlFragment('content').toString()
}

async function flushQueuedYjsWrites(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function getSerializedRoot(yDoc: Y.Doc): CanvasItem {
  const root = yDoc.getMap('state').get('root') as (CanvasItem & { toJSON?: () => CanvasItem }) | undefined
  if (!root) {
    throw new Error('Expected serialized root')
  }

  return typeof root.toJSON === 'function' ? root.toJSON() : root
}

function collectSectionsWithInvalidMemberIds(
  canvas: CanvasItem,
  path: string = canvas.id
): Array<{ path: string; id: string; title?: string; keys: string[]; memberIds: unknown }> {
  const invalidSections: Array<{ path: string; id: string; title?: string; keys: string[]; memberIds: unknown }> = []

  for (const section of canvas.sections ?? []) {
    if (!Array.isArray(section.memberIds)) {
      invalidSections.push({
        path,
        id: section.id,
        title: section.title,
        keys: Object.keys(section),
        memberIds: section.memberIds,
      })
    }
  }

  for (const item of canvas.items) {
    if (item.kind === 'canvas') {
      invalidSections.push(...collectSectionsWithInvalidMemberIds(item, `${path}/${item.id}`))
    }
  }

  return invalidSections
}

function expectAllSectionsToHaveMemberIds(canvas: CanvasItem, label: string): void {
  const invalidSections = collectSectionsWithInvalidMemberIds(canvas)
  if (invalidSections.length > 0) {
    throw new Error(`${label}: sections missing memberIds: ${JSON.stringify(invalidSections)}`)
  }
}

function createYSection({ id, title, memberIds }: { id: string; title: string; memberIds: string[] }): Y.Map<unknown> {
  const section = new Y.Map<unknown>()
  const members = new Y.Array<string>()
  members.insert(0, memberIds)

  section.set('id', id)
  section.set('title', title)
  section.set('layout', 'grid')
  section.set('position', { x: 0, y: 0 })
  section.set('columns', 2)
  section.set('memberIds', members)

  return section
}

type MixedSectionDeletionFixture = {
  allNodes: NodeItem[]
  deletedIds: string[]
  fullSectionId: string
  partialSectionId: string
  rootCanvas: CanvasItem
  survivingIds: string[]
}

function createMixedSectionDeletionFixture(): MixedSectionDeletionFixture {
  const fullSectionId = 'full-section'
  const partialSectionId = 'partial-section'
  const unsectionedNode = createBlockNode('unsectioned-node', 'New Document')
  const fullSectionNodeA = createBlockNode('full-section-node-a', 'Full section A')
  const fullSectionNodeB = createBlockNode('full-section-node-b', 'Full section B')
  const partialSectionNodeA = createBlockNode('partial-section-node-a', 'Partial section A')
  const partialSectionNodeB = createBlockNode('partial-section-node-b', 'Partial section B')
  const partialSectionNodeC = createBlockNode('partial-section-node-c', 'Partial section C')

  for (const node of [fullSectionNodeA, fullSectionNodeB]) {
    node.xynode.data = { sectionId: fullSectionId }
  }
  for (const node of [partialSectionNodeA, partialSectionNodeB, partialSectionNodeC]) {
    node.xynode.data = { sectionId: partialSectionId }
  }

  const allNodes = [
    unsectionedNode,
    fullSectionNodeA,
    fullSectionNodeB,
    partialSectionNodeA,
    partialSectionNodeB,
    partialSectionNodeC,
  ]
  const rootCanvas = createCanvas('root', '', allNodes)
  rootCanvas.sections = [
    {
      id: fullSectionId,
      title: 'Full section',
      layout: 'grid',
      position: { x: 0, y: 0 },
      memberIds: [fullSectionNodeA.id, fullSectionNodeB.id],
      columns: 2,
    },
    {
      id: partialSectionId,
      title: 'Partial section',
      layout: 'grid',
      position: { x: 0, y: 300 },
      memberIds: [partialSectionNodeA.id, partialSectionNodeB.id, partialSectionNodeC.id],
      columns: 2,
    },
  ]

  return {
    allNodes,
    deletedIds: [
      unsectionedNode.id,
      fullSectionNodeA.id,
      fullSectionNodeB.id,
      partialSectionNodeA.id,
      partialSectionNodeB.id,
    ],
    fullSectionId,
    partialSectionId,
    rootCanvas,
    survivingIds: [partialSectionNodeC.id],
  }
}

function destroyTestWorkspace(workspace: TestWorkspace): void {
  workspace.undoController.destroy()
  workspace.dispose()
  workspace.yDoc.destroy()
}

async function expectWorkspaceUndoPrefixesToKeepSectionMemberIds(
  workspace: TestWorkspace,
  label: string
): Promise<Uint8Array[]> {
  const deleteStateUpdate = Y.encodeStateAsUpdate(workspace.yDoc)
  const undoUpdates: Uint8Array[] = []
  const captureUndoUpdate = (update: Uint8Array) => {
    undoUpdates.push(update)
  }

  workspace.yDoc.on('update', captureUndoUpdate)
  try {
    await act(async () => {
      workspace.undoController.undo()
    })
    await flushQueuedYjsWrites()
  } finally {
    workspace.yDoc.off('update', captureUndoUpdate)
  }

  expect(undoUpdates.length).toBeGreaterThan(0)
  expectAllSectionsToHaveMemberIds(getSerializedRoot(workspace.yDoc), `${label} local state after undo`)

  for (let prefixLength = 0; prefixLength <= undoUpdates.length; prefixLength += 1) {
    const freshDoc = new Y.Doc()
    try {
      Y.applyUpdate(freshDoc, deleteStateUpdate)
      for (let index = 0; index < prefixLength; index += 1) {
        Y.applyUpdate(freshDoc, undoUpdates[index]!)
      }

      expectAllSectionsToHaveMemberIds(
        getSerializedRoot(freshDoc),
        `${label} fresh reload after undo update prefix ${prefixLength}/${undoUpdates.length}`
      )
    } finally {
      freshDoc.destroy()
    }
  }

  return undoUpdates
}

async function expectYjsUndoPrefixesToKeepSectionMemberIds(
  yDoc: Y.Doc,
  undo: () => void,
  label: string
): Promise<Uint8Array[]> {
  const deleteStateUpdate = Y.encodeStateAsUpdate(yDoc)
  const undoUpdates: Uint8Array[] = []
  const captureUndoUpdate = (update: Uint8Array) => {
    undoUpdates.push(update)
  }

  yDoc.on('update', captureUndoUpdate)
  try {
    undo()
    await flushQueuedYjsWrites()
  } finally {
    yDoc.off('update', captureUndoUpdate)
  }

  expect(undoUpdates.length).toBeGreaterThan(0)
  expectAllSectionsToHaveMemberIds(getSerializedRoot(yDoc), `${label} local state after undo`)

  for (let prefixLength = 0; prefixLength <= undoUpdates.length; prefixLength += 1) {
    const freshDoc = new Y.Doc()
    try {
      Y.applyUpdate(freshDoc, deleteStateUpdate)
      for (let index = 0; index < prefixLength; index += 1) {
        Y.applyUpdate(freshDoc, undoUpdates[index]!)
      }

      expectAllSectionsToHaveMemberIds(
        getSerializedRoot(freshDoc),
        `${label} fresh reload after undo update prefix ${prefixLength}/${undoUpdates.length}`
      )
    } finally {
      freshDoc.destroy()
    }
  }

  return undoUpdates
}

function DeleteHooksHarness({ onReady }: { onReady: (api: HarnessApi) => void }) {
  const workspace = useContext(WorkspaceContext)
  const deleteNode = useDeleteNode()
  const deleteTreeItem = useDeleteTreeItem()
  if (!workspace?.store.root) {
    throw new Error('DeleteHooksHarness requires a root canvas')
  }
  const canvasDeletion = useCanvasDeletion({
    mutableCanvas: workspace.store.root,
    root: workspace.store.root,
    workspaceUndoController: workspace.workspaceUndoController,
    yDoc: workspace.yDoc,
  })

  useEffect(() => {
    onReady({
      confirmCanvasDelete: canvasDeletion.confirmDelete,
      deleteNode,
      deleteTreeItem,
      queueCanvasDelete: (nodeIds: string | string[]) => {
        const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds]
        canvasDeletion.queueDeleteConfirmation(ids.map((id) => ({ id, type: 'remove' }) satisfies NodeChange))
      },
    })
  }, [canvasDeletion.confirmDelete, canvasDeletion.queueDeleteConfirmation, deleteNode, deleteTreeItem, onReady])

  return null
}

function createTestWorkspace(rootCanvas: CanvasItem, noteDocs: Array<{ id: string; text?: string }>): TestWorkspace {
  const yDoc = new Y.Doc()
  const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  act(() => {
    store.root = rootCanvas
  })

  for (const noteDoc of noteDocs) {
    const created = createNoteDoc(yDoc, noteDoc.id, 'blockNote')
    if (noteDoc.text) {
      setBlockNoteFragmentText(created.getXmlFragment('content'), noteDoc.text)
    }
  }

  const undoController = new WorkspaceUndoController(yDoc)
  const localUser: UserIdentity = {
    id: 'local-user',
    name: 'Local User',
    color: '#111111',
  }
  const contextValue: WorkspaceContextValue = {
    store,
    yDoc,
    provider: {} as WorkspaceContextValue['provider'],
    localUser,
    acquireCursorPresenceSuppression: () => () => {},
    isCursorPresenceSuppressed: () => false,
    contentStore: createWorkspaceContentStore(yDoc),
    workspaceUndoController: undoController,
    sharedEditorUndoManager: undoController.undoManager as unknown as Y.UndoManager,
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
    yDoc,
    store,
    contextValue,
    undoController,
    dispose,
  }
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

async function renderDeleteHooks(contextValue: WorkspaceContextValue): Promise<HarnessApi> {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  const api = {} as HarnessApi

  await act(async () => {
    mountedRoot?.render(
      createElement(
        WorkspaceContext.Provider,
        { value: contextValue },
        createElement(DeleteHooksHarness, {
          onReady: (nextApi: HarnessApi) => {
            Object.assign(api, nextApi)
          },
        })
      )
    )
  })

  if (!api.deleteNode) {
    throw new Error('Harness API was not initialized')
  }

  return api
}

describe('workspace note undo + delete flows', () => {
  it('restores nested memberIds arrays when undoing pure Yjs section mutations', () => {
    const origin = Symbol('pure-yjs-section-delete')
    const yDoc = new Y.Doc()
    const root = yDoc.getMap<unknown>('state')
    const sections = new Y.Array<Y.Map<unknown>>()

    yDoc.transact(() => {
      sections.insert(0, [
        createYSection({
          id: 'full-section',
          title: 'Full section',
          memberIds: ['full-section-node-a', 'full-section-node-b'],
        }),
        createYSection({
          id: 'partial-section',
          title: 'Partial section',
          memberIds: ['partial-section-node-a', 'partial-section-node-b', 'partial-section-node-c'],
        }),
      ])
      root.set('sections', sections)
    })

    const undoManager = new Y.UndoManager(root, { trackedOrigins: new Set([origin]) })

    yDoc.transact(() => {
      sections.delete(0, 1)
      const partialSection = sections.get(0)
      const memberIds = partialSection.get('memberIds') as Y.Array<string> | undefined
      if (!memberIds) {
        throw new Error('Expected partial section memberIds')
      }

      memberIds.delete(0, 2)
    }, origin)

    expect(root.toJSON()).toMatchObject({
      sections: [
        {
          id: 'partial-section',
          memberIds: ['partial-section-node-c'],
        },
      ],
    })

    undoManager.undo()

    const restoredSections = root.toJSON().sections as Array<{ id: string; memberIds?: unknown }>
    expect(restoredSections.map((section) => section.id)).toEqual(['full-section', 'partial-section'])
    for (const section of restoredSections) {
      expect(Array.isArray(section.memberIds)).toBe(true)
    }
    expect(restoredSections[0]?.memberIds).toEqual(['full-section-node-a', 'full-section-node-b'])
    expect(restoredSections[1]?.memberIds).toEqual([
      'partial-section-node-a',
      'partial-section-node-b',
      'partial-section-node-c',
    ])

    undoManager.destroy()
    yDoc.destroy()
  })

  it('restores nested memberIds arrays when undoing valtio-y proxy section mutations', async () => {
    const yDoc = new Y.Doc()
    const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    store.root = createCanvas('root', '', [])
    store.root.sections = [
      {
        id: 'full-section',
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: ['full-section-node-a', 'full-section-node-b'],
        columns: 2,
      },
      {
        id: 'partial-section',
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: ['partial-section-node-a', 'partial-section-node-b', 'partial-section-node-c'],
        columns: 2,
      },
    ]
    await flushQueuedYjsWrites()

    const undoManager = new Y.UndoManager(yDoc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN]),
      captureTimeout: 0,
    })

    store.root.sections.splice(0, 1)
    store.root.sections[0]?.memberIds.splice(0, 2)
    await flushQueuedYjsWrites()

    expect(store.root.sections.map((section) => section.id)).toEqual(['partial-section'])
    expect(store.root.sections[0]?.memberIds).toEqual(['partial-section-node-c'])

    const deleteStateUpdate = Y.encodeStateAsUpdate(yDoc)
    const undoUpdates: Uint8Array[] = []
    const captureUndoUpdate = (update: Uint8Array) => {
      undoUpdates.push(update)
    }

    yDoc.on('update', captureUndoUpdate)
    try {
      undoManager.undo()
      await flushQueuedYjsWrites()
    } finally {
      yDoc.off('update', captureUndoUpdate)
    }

    expect(undoUpdates.length).toBeGreaterThan(0)

    const rootAfterUndo = getSerializedRoot(yDoc)
    expectAllSectionsToHaveMemberIds(rootAfterUndo, 'valtio-y local state after undo')
    expect(rootAfterUndo.sections?.map((section) => section.id)).toEqual(['full-section', 'partial-section'])
    expect(rootAfterUndo.sections?.[0]?.memberIds).toEqual(['full-section-node-a', 'full-section-node-b'])
    expect(rootAfterUndo.sections?.[1]?.memberIds).toEqual([
      'partial-section-node-a',
      'partial-section-node-b',
      'partial-section-node-c',
    ])

    for (let prefixLength = 0; prefixLength <= undoUpdates.length; prefixLength += 1) {
      const freshDoc = new Y.Doc()
      try {
        Y.applyUpdate(freshDoc, deleteStateUpdate)
        for (let index = 0; index < prefixLength; index += 1) {
          Y.applyUpdate(freshDoc, undoUpdates[index]!)
        }

        expectAllSectionsToHaveMemberIds(
          getSerializedRoot(freshDoc),
          `fresh valtio-y reload after undo update prefix ${prefixLength}/${undoUpdates.length}`
        )
      } finally {
        freshDoc.destroy()
      }
    }

    undoManager.destroy()
    dispose()
    yDoc.destroy()
  })

  it('keeps section memberIds in undo prefixes with valtio-y section-array replacement using a reused section proxy', async () => {
    const yDoc = new Y.Doc()
    const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    store.root = createCanvas('root', '', [])
    store.root.sections = [
      {
        id: 'full-section',
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: ['full-section-node-a', 'full-section-node-b'],
        columns: 2,
      },
      {
        id: 'partial-section',
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: ['partial-section-node-a', 'partial-section-node-b', 'partial-section-node-c'],
        columns: 2,
      },
    ]
    await flushQueuedYjsWrites()

    const undoManager = new Y.UndoManager(yDoc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN]),
      captureTimeout: 0,
    })

    const partialSection = store.root.sections[1]
    if (!partialSection) {
      throw new Error('Expected partial section')
    }
    partialSection.memberIds = ['partial-section-node-c']
    store.root.sections = [partialSection]
    await flushQueuedYjsWrites()

    const deleteStateRoot = getSerializedRoot(yDoc)
    expectAllSectionsToHaveMemberIds(deleteStateRoot, 'valtio-y reused section proxy delete-state baseline')
    expect(deleteStateRoot.sections?.map((section) => section.id)).toEqual(['partial-section'])
    expect(deleteStateRoot.sections?.[0]?.memberIds).toEqual(['partial-section-node-c'])

    try {
      await expectYjsUndoPrefixesToKeepSectionMemberIds(yDoc, () => undoManager.undo(), 'valtio-y reused section proxy')
    } finally {
      undoManager.destroy()
      dispose()
      yDoc.destroy()
    }
  })

  it('keeps section memberIds in undo prefixes with valtio-y section-array replacement using a rebuilt plain section', async () => {
    const yDoc = new Y.Doc()
    const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    store.root = createCanvas('root', '', [])
    store.root.sections = [
      {
        id: 'full-section',
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: ['full-section-node-a', 'full-section-node-b'],
        columns: 2,
      },
      {
        id: 'partial-section',
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: ['partial-section-node-a', 'partial-section-node-b', 'partial-section-node-c'],
        columns: 2,
      },
    ]
    await flushQueuedYjsWrites()

    const undoManager = new Y.UndoManager(yDoc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN]),
      captureTimeout: 0,
    })

    const partialSection = store.root.sections[1]
    if (!partialSection) {
      throw new Error('Expected partial section')
    }
    store.root.sections = [
      {
        id: partialSection.id,
        title: partialSection.title,
        layout: partialSection.layout,
        position: { ...partialSection.position },
        memberIds: ['partial-section-node-c'],
        columns: partialSection.columns,
      },
    ]
    await flushQueuedYjsWrites()

    const deleteStateRoot = getSerializedRoot(yDoc)
    expectAllSectionsToHaveMemberIds(deleteStateRoot, 'valtio-y rebuilt plain section delete-state baseline')
    expect(deleteStateRoot.sections?.map((section) => section.id)).toEqual(['partial-section'])
    expect(deleteStateRoot.sections?.[0]?.memberIds).toEqual(['partial-section-node-c'])

    try {
      await expectYjsUndoPrefixesToKeepSectionMemberIds(
        yDoc,
        () => undoManager.undo(),
        'valtio-y rebuilt plain section'
      )
    } finally {
      undoManager.destroy()
      dispose()
      yDoc.destroy()
    }
  })

  it('keeps section memberIds in undo prefixes with WorkspaceUndoController direct proxy section mutations', async () => {
    const rootCanvas = createCanvas('root', '', [])
    rootCanvas.sections = [
      {
        id: 'full-section',
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: ['full-section-node-a', 'full-section-node-b'],
        columns: 2,
      },
      {
        id: 'partial-section',
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: ['partial-section-node-a', 'partial-section-node-b', 'partial-section-node-c'],
        columns: 2,
      },
    ]

    const workspace = createTestWorkspace(rootCanvas, [])
    try {
      await flushQueuedYjsWrites()

      workspace.undoController.runCommand(() => {
        const sections = workspace.store.root?.sections
        if (!sections) {
          throw new Error('Expected root sections')
        }

        sections.splice(0, 1)
        sections[0]?.memberIds.splice(0, 2)
      })
      await flushQueuedYjsWrites()

      expect(workspace.store.root?.sections?.map((section) => section.id)).toEqual(['partial-section'])
      expect(workspace.store.root?.sections?.[0]?.memberIds).toEqual(['partial-section-node-c'])

      await expectWorkspaceUndoPrefixesToKeepSectionMemberIds(
        workspace,
        'WorkspaceUndoController direct proxy mutations'
      )
    } finally {
      destroyTestWorkspace(workspace)
    }
  })

  it('keeps section memberIds in undo prefixes with WorkspaceUndoController canvas deletion only', async () => {
    const fixture = createMixedSectionDeletionFixture()
    const workspace = createTestWorkspace(fixture.rootCanvas, [])

    try {
      await flushQueuedYjsWrites()

      workspace.undoController.runCommand(() => {
        if (!workspace.store.root) {
          throw new Error('Expected root canvas')
        }

        deleteCanvasItemsFromCanvas(workspace.store.root, fixture.deletedIds)
      })
      await flushQueuedYjsWrites()

      const deleteStateRoot = getSerializedRoot(workspace.yDoc)
      expectAllSectionsToHaveMemberIds(deleteStateRoot, 'WorkspaceUndoController canvas deletion delete-state baseline')
      expect(deleteStateRoot.items.map((item) => item.id)).toEqual(fixture.survivingIds)
      expect(deleteStateRoot.sections?.map((section) => section.id)).toEqual([fixture.partialSectionId])
      expect(deleteStateRoot.sections?.[0]?.memberIds).toEqual(fixture.survivingIds)

      await expectWorkspaceUndoPrefixesToKeepSectionMemberIds(workspace, 'WorkspaceUndoController canvas deletion only')
    } finally {
      destroyTestWorkspace(workspace)
    }
  })

  it('keeps section memberIds in undo prefixes with WorkspaceUndoController canvas deletion plus note lifecycle', async () => {
    const fixture = createMixedSectionDeletionFixture()
    const workspace = createTestWorkspace(
      fixture.rootCanvas,
      fixture.allNodes.map((node) => ({ id: node.id, text: node.name }))
    )

    try {
      await flushQueuedYjsWrites()

      workspace.undoController.runCommand(() => {
        if (!workspace.store.root) {
          throw new Error('Expected root canvas')
        }

        const removedItems = getDeletableCanvasItems(workspace.store.root, fixture.deletedIds)
        rememberDeletedNoteDocsForRemovedItems(workspace.yDoc, removedItems, (noteId, noteDoc) => {
          workspace.undoController.rememberDeletedNoteDoc(noteId, noteDoc)
        })
        deleteNoteDocsForRemovedItems(workspace.yDoc, removedItems)
        deleteCanvasItemsFromCanvas(workspace.store.root, fixture.deletedIds)
      })
      await flushQueuedYjsWrites()

      const deleteStateRoot = getSerializedRoot(workspace.yDoc)
      expectAllSectionsToHaveMemberIds(
        deleteStateRoot,
        'WorkspaceUndoController canvas deletion plus note lifecycle delete-state baseline'
      )
      expect(deleteStateRoot.items.map((item) => item.id)).toEqual(fixture.survivingIds)
      expect(deleteStateRoot.sections?.map((section) => section.id)).toEqual([fixture.partialSectionId])
      expect(deleteStateRoot.sections?.[0]?.memberIds).toEqual(fixture.survivingIds)
      for (const deletedId of fixture.deletedIds) {
        expect(getNoteDoc(workspace.yDoc, deletedId)).toBeUndefined()
      }

      await expectWorkspaceUndoPrefixesToKeepSectionMemberIds(
        workspace,
        'WorkspaceUndoController canvas deletion plus note lifecycle'
      )
    } finally {
      destroyTestWorkspace(workspace)
    }
  })

  it('tracks blocknote edits in the workspace undo stack', () => {
    const blockNode = createBlockNode('block-node', 'Block node')
    const workspace = createTestWorkspace(createCanvas('root', '', [blockNode]), [{ id: blockNode.id, text: 'before' }])

    const noteDoc = getNoteDoc(workspace.yDoc, blockNode.id)
    if (!noteDoc) {
      throw new Error('Expected blocknote doc')
    }

    act(() => {
      updateBlockNoteText(noteDoc, 'after')
    })

    expect(readBlockNoteText(noteDoc)).toContain('after')

    act(() => {
      workspace.undoController.undo()
    })

    expect(readBlockNoteText(noteDoc)).toContain('before')

    act(() => {
      workspace.undoController.redo()
    })

    expect(readBlockNoteText(noteDoc)).toContain('after')

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('tracks blocknote edits that become ready after the undo controller is created', () => {
    const blockNode = createBlockNode('late-block-node', 'Late block node')
    const yDoc = new Y.Doc()
    const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    act(() => {
      store.root = createCanvas('root', '', [blockNode])
    })

    const lateNoteDoc = new Y.Doc({ guid: blockNode.id })
    act(() => {
      yDoc.getMap<Y.Doc>('notes').set(blockNode.id, lateNoteDoc)
    })

    const undoController = new WorkspaceUndoController(yDoc)

    act(() => {
      initializeBlockNoteDoc(lateNoteDoc, blockNode.id, 'before')
    })

    act(() => {
      updateBlockNoteText(lateNoteDoc, 'after')
    })

    expect(readBlockNoteText(lateNoteDoc)).toContain('after')

    act(() => {
      undoController.undo()
    })

    expect(readBlockNoteText(lateNoteDoc)).toContain('before')

    undoController.destroy()
    dispose()
    yDoc.destroy()
  })

  it('deletes a node note doc immediately and restores it with one undo', async () => {
    const blockNode = createBlockNode('block-node', 'Block node')
    const workspace = createTestWorkspace(createCanvas('root', '', [blockNode]), [{ id: blockNode.id }])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.deleteNode(blockNode.id, 'root')
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.items[0]?.id).toBe(blockNode.id)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeDefined()

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('restores section membership when undoing canvas deletion of a sectioned node', async () => {
    const sectionId = 'section-1'
    const blockNode = createBlockNode('sectioned-block-node', 'Sectioned block node')
    blockNode.xynode.data = { sectionId }
    const rootCanvas = createCanvas('root', '', [blockNode])
    rootCanvas.sections = [
      {
        id: sectionId,
        title: 'Section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: [blockNode.id],
        columns: 2,
      },
    ]

    const workspace = createTestWorkspace(rootCanvas, [{ id: blockNode.id, text: 'sectioned content' }])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.queueCanvasDelete(blockNode.id)
    })
    await act(async () => {
      api.confirmCanvasDelete()
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.items[0]?.id).toBe(blockNode.id)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeDefined()
    expect(workspace.store.root?.sections).toHaveLength(1)
    expect(workspace.store.root?.sections?.[0]?.memberIds).toEqual([blockNode.id])
    expect((workspace.store.root?.items[0] as NodeItem | undefined)?.xynode.data.sectionId).toBe(sectionId)

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('restores full-section and partial-section canvas deletion with persisted memberIds after undo', async () => {
    const fullSectionId = 'full-section'
    const partialSectionId = 'partial-section'
    const unsectionedNode = createBlockNode('unsectioned-node', 'New Document')
    const fullSectionNodeA = createBlockNode('full-section-node-a', 'Full section A')
    const fullSectionNodeB = createBlockNode('full-section-node-b', 'Full section B')
    const partialSectionNodeA = createBlockNode('partial-section-node-a', 'Partial section A')
    const partialSectionNodeB = createBlockNode('partial-section-node-b', 'Partial section B')
    const partialSectionNodeC = createBlockNode('partial-section-node-c', 'Partial section C')

    for (const node of [fullSectionNodeA, fullSectionNodeB]) {
      node.xynode.data = { sectionId: fullSectionId }
    }
    for (const node of [partialSectionNodeA, partialSectionNodeB, partialSectionNodeC]) {
      node.xynode.data = { sectionId: partialSectionId }
    }

    const rootCanvas = createCanvas('root', '', [
      unsectionedNode,
      fullSectionNodeA,
      fullSectionNodeB,
      partialSectionNodeA,
      partialSectionNodeB,
      partialSectionNodeC,
    ])
    rootCanvas.sections = [
      {
        id: fullSectionId,
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: [fullSectionNodeA.id, fullSectionNodeB.id],
        columns: 2,
      },
      {
        id: partialSectionId,
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: [partialSectionNodeA.id, partialSectionNodeB.id, partialSectionNodeC.id],
        columns: 2,
      },
    ]

    const workspace = createTestWorkspace(
      rootCanvas,
      [
        unsectionedNode,
        fullSectionNodeA,
        fullSectionNodeB,
        partialSectionNodeA,
        partialSectionNodeB,
        partialSectionNodeC,
      ].map((node) => ({ id: node.id, text: node.name }))
    )
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.queueCanvasDelete([
        unsectionedNode.id,
        fullSectionNodeA.id,
        fullSectionNodeB.id,
        partialSectionNodeA.id,
        partialSectionNodeB.id,
      ])
    })
    await act(async () => {
      api.confirmCanvasDelete()
    })
    await flushQueuedYjsWrites()

    expect(workspace.store.root?.items.map((item) => item.id)).toEqual([partialSectionNodeC.id])
    expect(workspace.store.root?.sections?.map((section) => section.id)).toEqual([partialSectionId])
    expect(workspace.store.root?.sections?.[0]?.memberIds).toEqual([partialSectionNodeC.id])

    await act(async () => {
      workspace.undoController.undo()
    })

    const rootAfterImmediateUndo = getSerializedRoot(workspace.yDoc)
    const sectionsAfterImmediateUndo = new Map(
      (rootAfterImmediateUndo.sections ?? []).map((section) => [section.id, section])
    )
    expect(sectionsAfterImmediateUndo.get(fullSectionId)?.memberIds).toEqual([fullSectionNodeA.id, fullSectionNodeB.id])
    expect(sectionsAfterImmediateUndo.get(partialSectionId)?.memberIds).toEqual([
      partialSectionNodeA.id,
      partialSectionNodeB.id,
      partialSectionNodeC.id,
    ])
    for (const section of rootAfterImmediateUndo.sections ?? []) {
      expect(Array.isArray(section.memberIds)).toBe(true)
    }

    await flushQueuedYjsWrites()
    const rootAfterSettledUndo = getSerializedRoot(workspace.yDoc)
    const sectionsAfterSettledUndo = new Map(
      (rootAfterSettledUndo.sections ?? []).map((section) => [section.id, section])
    )
    expect(sectionsAfterSettledUndo.get(fullSectionId)?.memberIds).toEqual([fullSectionNodeA.id, fullSectionNodeB.id])
    expect(sectionsAfterSettledUndo.get(partialSectionId)?.memberIds).toEqual([
      partialSectionNodeA.id,
      partialSectionNodeB.id,
      partialSectionNodeC.id,
    ])

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('does not emit refresh-visible undo prefixes with missing section memberIds', async () => {
    const fullSectionId = 'full-section'
    const partialSectionId = 'partial-section'
    const unsectionedNode = createBlockNode('unsectioned-node', 'New Document')
    const fullSectionNodeA = createBlockNode('full-section-node-a', 'Full section A')
    const fullSectionNodeB = createBlockNode('full-section-node-b', 'Full section B')
    const partialSectionNodeA = createBlockNode('partial-section-node-a', 'Partial section A')
    const partialSectionNodeB = createBlockNode('partial-section-node-b', 'Partial section B')
    const partialSectionNodeC = createBlockNode('partial-section-node-c', 'Partial section C')

    for (const node of [fullSectionNodeA, fullSectionNodeB]) {
      node.xynode.data = { sectionId: fullSectionId }
    }
    for (const node of [partialSectionNodeA, partialSectionNodeB, partialSectionNodeC]) {
      node.xynode.data = { sectionId: partialSectionId }
    }

    const rootCanvas = createCanvas('root', '', [
      unsectionedNode,
      fullSectionNodeA,
      fullSectionNodeB,
      partialSectionNodeA,
      partialSectionNodeB,
      partialSectionNodeC,
    ])
    rootCanvas.sections = [
      {
        id: fullSectionId,
        title: 'Full section',
        layout: 'grid',
        position: { x: 0, y: 0 },
        memberIds: [fullSectionNodeA.id, fullSectionNodeB.id],
        columns: 2,
      },
      {
        id: partialSectionId,
        title: 'Partial section',
        layout: 'grid',
        position: { x: 0, y: 300 },
        memberIds: [partialSectionNodeA.id, partialSectionNodeB.id, partialSectionNodeC.id],
        columns: 2,
      },
    ]

    const workspace = createTestWorkspace(
      rootCanvas,
      [
        unsectionedNode,
        fullSectionNodeA,
        fullSectionNodeB,
        partialSectionNodeA,
        partialSectionNodeB,
        partialSectionNodeC,
      ].map((node) => ({ id: node.id, text: node.name }))
    )
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.queueCanvasDelete([
        unsectionedNode.id,
        fullSectionNodeA.id,
        fullSectionNodeB.id,
        partialSectionNodeA.id,
        partialSectionNodeB.id,
      ])
    })
    await act(async () => {
      api.confirmCanvasDelete()
    })
    await flushQueuedYjsWrites()

    const deleteStateRoot = getSerializedRoot(workspace.yDoc)
    expectAllSectionsToHaveMemberIds(deleteStateRoot, 'delete-state baseline')
    expect(deleteStateRoot.items.map((item) => item.id)).toEqual([partialSectionNodeC.id])
    expect(deleteStateRoot.sections?.map((section) => section.id)).toEqual([partialSectionId])
    expect(deleteStateRoot.sections?.[0]?.memberIds).toEqual([partialSectionNodeC.id])

    const deleteStateUpdate = Y.encodeStateAsUpdate(workspace.yDoc)
    const undoUpdates: Uint8Array[] = []
    const captureUndoUpdate = (update: Uint8Array) => {
      undoUpdates.push(update)
    }

    workspace.yDoc.on('update', captureUndoUpdate)
    try {
      await act(async () => {
        workspace.undoController.undo()
      })
      await flushQueuedYjsWrites()
    } finally {
      workspace.yDoc.off('update', captureUndoUpdate)
    }

    expect(undoUpdates.length).toBeGreaterThan(0)
    expectAllSectionsToHaveMemberIds(getSerializedRoot(workspace.yDoc), 'local state after undo')

    for (let prefixLength = 0; prefixLength <= undoUpdates.length; prefixLength += 1) {
      const freshDoc = new Y.Doc()
      try {
        Y.applyUpdate(freshDoc, deleteStateUpdate)
        for (let index = 0; index < prefixLength; index += 1) {
          Y.applyUpdate(freshDoc, undoUpdates[index]!)
        }

        expectAllSectionsToHaveMemberIds(
          getSerializedRoot(freshDoc),
          `fresh reload after undo update prefix ${prefixLength}/${undoUpdates.length}`
        )
      } finally {
        freshDoc.destroy()
      }
    }

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('removes and restores section membership when deleting a node through the tree hook', async () => {
    const sectionId = 'section-1'
    const blockNode = createBlockNode('sectioned-hook-node', 'Sectioned hook node')
    blockNode.xynode.data = { sectionId }
    const rootCanvas = createCanvas('root', '', [blockNode])
    rootCanvas.sections = [
      {
        id: sectionId,
        title: 'Section',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: [blockNode.id],
      },
    ]

    const workspace = createTestWorkspace(rootCanvas, [{ id: blockNode.id, text: 'sectioned content' }])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.deleteNode(blockNode.id, 'root')
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(workspace.store.root?.sections ?? []).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.sections).toHaveLength(1)
    expect(workspace.store.root?.sections?.[0]?.memberIds).toEqual([blockNode.id])
    expect((workspace.store.root?.items[0] as NodeItem | undefined)?.xynode.data.sectionId).toBe(sectionId)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeDefined()

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('removes and restores group membership when deleting a grouped node through the tree hook', async () => {
    const blockNode = createBlockNode('grouped-hook-node', 'Grouped hook node')
    blockNode.collapsed = true
    const rootCanvas = createCanvas('root', '', [blockNode])
    rootCanvas.groups = [
      {
        id: 'group-1',
        name: 'Group',
        position: { x: 0, y: 0 },
        memberIds: [blockNode.id],
      },
    ]

    const workspace = createTestWorkspace(rootCanvas, [{ id: blockNode.id, text: 'grouped content' }])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.deleteNode(blockNode.id, 'root')
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(workspace.store.root?.groups ?? []).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.groups).toHaveLength(1)
    expect(workspace.store.root?.groups?.[0]?.memberIds).toEqual([blockNode.id])
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeDefined()

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('removes and restores section membership when deleting a sectioned child canvas', async () => {
    const childCanvas = createCanvas('child-canvas', 'Child canvas', [])
    const rootCanvas = createCanvas('root', '', [childCanvas])
    rootCanvas.sections = [
      {
        id: 'section-1',
        title: 'Section',
        layout: 'horizontal',
        position: { x: 0, y: 0 },
        memberIds: [childCanvas.id],
      },
    ]

    const workspace = createTestWorkspace(rootCanvas, [])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.deleteTreeItem(childCanvas.id)
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(workspace.store.root?.sections ?? []).toHaveLength(0)

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.items[0]?.id).toBe(childCanvas.id)
    expect(workspace.store.root?.sections).toHaveLength(1)
    expect(workspace.store.root?.sections?.[0]?.memberIds).toEqual([childCanvas.id])

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('restores the attached note doc when undoing canvas deletion of a newly-created node', async () => {
    const workspace = createTestWorkspace(createCanvas('root', '', []), [])
    const api = await renderDeleteHooks(workspace.contextValue)
    const blockNode = createBlockNode('new-session-block-node', 'New Document')

    act(() => {
      workspace.undoController.runCommand(() => {
        const noteDoc = createNoteDoc(workspace.yDoc, blockNode.id, 'blockNote')
        setBlockNoteFragmentText(noteDoc.getXmlFragment('content'), 'created in this session')
        workspace.store.root.items.push(blockNode)
      })
    })
    await Promise.resolve()

    const noteDoc = getNoteDoc(workspace.yDoc, blockNode.id)
    if (!noteDoc) {
      throw new Error('Expected created note doc')
    }

    act(() => {
      updateBlockNoteText(noteDoc, 'edited before delete')
    })

    await act(async () => {
      api.queueCanvasDelete(blockNode.id)
    })
    await act(async () => {
      api.confirmCanvasDelete()
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, blockNode.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.items[0]?.id).toBe(blockNode.id)
    const restoredNoteDoc = getNoteDoc(workspace.yDoc, blockNode.id)
    expect(restoredNoteDoc).toBeDefined()
    expect(restoredNoteDoc ? readBlockNoteText(restoredNoteDoc) : '').toContain('edited before delete')

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })

  it('deletes nested note docs with canvas delete and restores them with undo', async () => {
    const nestedBlock = createBlockNode('nested-block', 'Nested block')
    const nestedBlockTwo = createBlockNode('nested-block-two', 'Nested block two')
    const childCanvas = createCanvas('child-canvas', 'Child canvas', [nestedBlock, nestedBlockTwo])

    const workspace = createTestWorkspace(createCanvas('root', '', [childCanvas]), [
      { id: nestedBlock.id },
      { id: nestedBlockTwo.id, text: 'nested' },
    ])
    const api = await renderDeleteHooks(workspace.contextValue)

    await act(async () => {
      api.deleteTreeItem(childCanvas.id)
    })

    expect(workspace.store.root?.items).toHaveLength(0)
    expect(getNoteDoc(workspace.yDoc, nestedBlock.id)).toBeUndefined()
    expect(getNoteDoc(workspace.yDoc, nestedBlockTwo.id)).toBeUndefined()

    await act(async () => {
      workspace.undoController.undo()
    })

    expect(workspace.store.root?.items).toHaveLength(1)
    expect(workspace.store.root?.items[0]?.id).toBe(childCanvas.id)
    expect(getNoteDoc(workspace.yDoc, nestedBlock.id)).toBeDefined()
    expect(getNoteDoc(workspace.yDoc, nestedBlockTwo.id)).toBeDefined()

    workspace.undoController.destroy()
    workspace.dispose()
    workspace.yDoc.destroy()
  })
})
