import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BlockNoteEditor } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from 'valtio'
import { Awareness } from 'y-protocols/awareness'
import { VALTIO_Y_ORIGIN, createYjsProxy } from 'valtio-y'
import * as Y from 'yjs'

import { createWorkspaceContentStore } from 'shared/workspace-content-store'
import type { AuditFields, CanvasItem, NodeItem, WorkspaceDocument } from 'shared'
import { useBlockNoteAuditEffects } from '@/hooks/useBlockNoteAuditEffects'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { PersistSelectionExtension, persistSelectionKey } from '@/lib/persist-selection-extension'
import type { UserIdentity } from '@/lib/userIdentity'
import { findNodeById } from '@/lib/workspaceUtils'
import { AuthContext, type AuthContextValue, type AuthState } from '@/providers/auth/AuthContext'
import { WorkspaceContext, type WorkspaceContextValue } from '@/providers/workspace/WorkspaceContext'
import { createNoteDoc } from '@/lib/workspaceNoteDoc'
import { WorkspaceUndoController } from '@/lib/workspaceUndo'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {}
}

type TestEditor = BlockNoteEditor<typeof blockNoteSchema>

type UndoStackItemLike = {
  meta?: Map<unknown, unknown>
}

type MultiDocUndoStackEntry = {
  doc?: Y.Doc
  undoStack?: UndoStackItemLike[]
  redoStack?: UndoStackItemLike[]
}

interface TestWorkspace {
  store: WorkspaceDocument
  yDoc: Y.Doc
  noteDoc: Y.Doc
  undoController: WorkspaceUndoController
  dispose: () => void
}

interface TestSession {
  workspace: TestWorkspace
  editor: TestEditor
  cleanup: () => void
}

let mountedRoot: Root | null = null
let mountedContainer: HTMLDivElement | null = null
let pendingCleanups: Array<() => void> = []

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

function createAuthContextValue(): AuthContextValue {
  const state = proxy<AuthState>({
    token: 'token',
    user: {
      id: 'user-1',
      email: 'local@example.com',
      name: 'Local User',
    },
    isAuthenticated: true,
    isLoading: false,
  })

  return {
    state,
    login: async () => ({}),
    register: async () => ({}),
    logout: async () => {},
    loginWithGoogle: async () => ({}),
    setToken: (token) => {
      state.token = token
      state.isAuthenticated = Boolean(token)
    },
    setUser: (user) => {
      state.user = user
    },
  }
}

function createWorkspaceContextValue(workspace: TestWorkspace): WorkspaceContextValue {
  const awareness = new Awareness(workspace.yDoc)
  const localUser: UserIdentity = {
    id: 'local-user',
    name: 'Local User',
    color: '#111111',
  }

  pendingCleanups.push(() => {
    awareness.destroy()
  })

  return {
    store: workspace.store,
    yDoc: workspace.yDoc,
    provider: {
      awareness,
      acquireNoteAwareness: () => awareness,
      getNoteAwareness: () => awareness,
      releaseNoteAwareness: () => {},
    } as WorkspaceContextValue['provider'],
    localUser,
    acquireCursorPresenceSuppression: () => () => {},
    isCursorPresenceSuppressed: () => false,
    contentStore: createWorkspaceContentStore(workspace.yDoc),
    workspaceUndoController: workspace.undoController,
    sharedEditorUndoManager: workspace.undoController.undoManager as unknown as Y.UndoManager,
    hasInitiallySynced: true,
    initialSyncError: null,
    isConnected: true,
    isReconnecting: false,
    disconnectReason: null,
    workspaceId: 'workspace-test',
    activeCanvasId: 'root',
    setActiveCanvasId: () => {},
  }
}

function AuditEffectsHarness({
  editor,
  nodeId,
  isKanwasProtected,
}: {
  editor: TestEditor
  nodeId: string
  isKanwasProtected: boolean
}) {
  useBlockNoteAuditEffects({
    editor: editor as never,
    nodeId,
    isKanwasProtected,
  })

  return null
}

function readNoteText(noteDoc: Y.Doc): string {
  return noteDoc
    .getXmlFragment('content')
    .toString()
    .replace(/<[^>]+>/g, '')
}

function readGroupedMarker(workspace: TestWorkspace): string | undefined {
  const value = workspace.yDoc.getMap('state').get('groupedMarker')
  return typeof value === 'string' ? value : undefined
}

function readNodeAudit(workspace: TestWorkspace, nodeId: string): AuditFields | undefined {
  if (!workspace.store.root) {
    return undefined
  }

  return findNodeById(workspace.store.root, nodeId)?.node.xynode.data?.audit as AuditFields | undefined
}

function readUndoOperationIds(controller: WorkspaceUndoController, kind: 'undo' | 'redo'): Array<string | null> {
  const stack =
    kind === 'undo'
      ? ((controller.undoManager as unknown as { undoStack: MultiDocUndoStackEntry[] }).undoStack ?? [])
      : ((controller.undoManager as unknown as { redoStack: MultiDocUndoStackEntry[] }).redoStack ?? [])

  return stack.map((entry) => {
    const docStack = kind === 'undo' ? entry.undoStack : entry.redoStack
    const operationId = docStack?.[docStack.length - 1]?.meta?.get('workspace-operation-id')
    return typeof operationId === 'string' ? operationId : null
  })
}

function findTextRange(editor: TestEditor, target: string): { from: number; to: number } {
  let resolvedRange: { from: number; to: number } | null = null

  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true
    }

    const startIndex = node.text.indexOf(target)
    if (startIndex === -1) {
      return true
    }

    const from = pos + startIndex
    resolvedRange = {
      from,
      to: from + target.length,
    }

    return false
  })

  if (!resolvedRange) {
    throw new Error(`Could not find text range for "${target}"`)
  }

  return resolvedRange
}

function setSelection(editor: TestEditor, from: number, to: number): void {
  const tiptap = editor._tiptapEditor
  const selection = TextSelection.create(tiptap.state.doc, from, to)
  tiptap.view.dispatch(tiptap.state.tr.setSelection(selection))
}

function insertTextAtSelection(editor: TestEditor, text: string): void {
  const tiptap = editor._tiptapEditor
  tiptap.view.dispatch(tiptap.state.tr.insertText(text))
}

function deleteSelection(editor: TestEditor): void {
  const tiptap = editor._tiptapEditor
  tiptap.view.dispatch(tiptap.state.tr.deleteSelection())
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function mountAuditEffectsHarness(
  workspace: TestWorkspace,
  editor: TestEditor,
  options: { nodeId?: string; isKanwasProtected?: boolean } = {}
): Promise<void> {
  mountedContainer = document.createElement('div')
  document.body.appendChild(mountedContainer)
  mountedRoot = createRoot(mountedContainer)

  const workspaceContextValue = createWorkspaceContextValue(workspace)
  const authContextValue = createAuthContextValue()

  await act(async () => {
    mountedRoot?.render(
      createElement(
        AuthContext.Provider,
        { value: authContextValue },
        createElement(
          WorkspaceContext.Provider,
          { value: workspaceContextValue },
          createElement(AuditEffectsHarness, {
            editor,
            nodeId: options.nodeId ?? 'note-1',
            isKanwasProtected: options.isKanwasProtected ?? false,
          })
        )
      )
    )
  })
}

async function seedNoteText(noteDoc: Y.Doc, text: string): Promise<void> {
  const awareness = new Awareness(noteDoc)
  const editor = BlockNoteEditor.create({
    schema: blockNoteSchema,
    trailingBlock: false,
    collaboration: {
      fragment: noteDoc.getXmlFragment('content'),
      provider: { awareness },
      user: {
        name: 'Seeder',
        color: '#111111',
      },
    },
  })

  const mountElement = document.createElement('div')
  document.body.appendChild(mountElement)
  editor.mount(mountElement)
  editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: text }])
  await flushAsyncWork()

  editor._tiptapEditor.destroy()
  awareness.destroy()
  mountElement.remove()
}

async function createWorkspace(noteId: string, noteName: string, initialText: string): Promise<TestWorkspace> {
  const yDoc = new Y.Doc()
  const { proxy: store, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
    getRoot: (doc) => doc.getMap('state'),
  })

  store.root = createCanvas('root', 'Root', [createBlockNode(noteId, noteName)])

  const noteDoc = createNoteDoc(yDoc, noteId, 'blockNote')
  await seedNoteText(noteDoc, initialText)

  return {
    store,
    yDoc,
    noteDoc,
    undoController: new WorkspaceUndoController(yDoc),
    dispose,
  }
}

async function createCollaborativeEditor(
  workspace: TestWorkspace,
  options: { extensions?: unknown[] } = {}
): Promise<{
  editor: TestEditor
  cleanup: () => void
}> {
  const awareness = new Awareness(workspace.noteDoc)
  const editor = BlockNoteEditor.create({
    schema: blockNoteSchema,
    trailingBlock: false,
    collaboration: {
      fragment: workspace.noteDoc.getXmlFragment('content'),
      provider: { awareness },
      user: {
        name: 'Local User',
        color: '#111111',
      },
      undoManager: workspace.undoController.undoManager as unknown as Y.UndoManager,
    },
    _tiptapOptions: options.extensions ? { extensions: options.extensions as never[] } : undefined,
  })

  const mountElement = document.createElement('div')
  document.body.appendChild(mountElement)
  editor.mount(mountElement)
  await flushAsyncWork()

  return {
    editor,
    cleanup: () => {
      editor._tiptapEditor.destroy()
      awareness.destroy()
      mountElement.remove()
    },
  }
}

function applyGroupedMarker(workspace: TestWorkspace, operationId: string, marker: string): void {
  workspace.undoController.runWithOperationId(operationId, () => {
    workspace.yDoc.transact(() => {
      workspace.yDoc.getMap('state').set('groupedMarker', marker)
    }, VALTIO_Y_ORIGIN)
  })
}

async function createSession(initialText: string): Promise<TestSession> {
  const workspace = await createWorkspace('note-1', 'Kanwas', initialText)
  const { editor, cleanup: cleanupEditor } = await createCollaborativeEditor(workspace)

  return {
    workspace,
    editor,
    cleanup: () => {
      cleanupEditor()
      workspace.undoController.destroy()
      workspace.dispose()
      workspace.yDoc.destroy()
    },
  }
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

  mountedRoot = null
  mountedContainer = null

  for (const cleanup of pendingCleanups.splice(0)) {
    cleanup()
  }

  vi.useRealTimers()
  vi.restoreAllMocks()

  if ((globalThis as { gc?: () => void }).gc) {
    ;(globalThis as { gc?: () => void }).gc?.()
  }
})

describe('BlockNote workspace undo grouping', () => {
  it('does not treat text selection as its own undo step before a selected-text delete', async () => {
    const session = await createSession('before delete after')

    try {
      const { workspace, editor } = session
      const initialUndoStackLength = workspace.undoController.undoManager.undoStack.length
      const initialOperationId = workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)

      const deleteRange = findTextRange(editor, 'delete ')
      setSelection(editor, deleteRange.from, deleteRange.to)

      expect(workspace.undoController.undoManager.undoStack.length).toBe(initialUndoStackLength)
      expect(workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)).toBe(initialOperationId)

      deleteSelection(editor)

      const deleteOperationId = workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)
      expect(deleteOperationId).toEqual(expect.any(String))

      applyGroupedMarker(workspace, deleteOperationId!, 'selection-delete')

      expect(readNoteText(workspace.noteDoc)).toBe('before after')
      expect(readGroupedMarker(workspace)).toBe('selection-delete')
      expect(readUndoOperationIds(workspace.undoController, 'undo').slice(-2)).toEqual([
        deleteOperationId,
        deleteOperationId,
      ])

      workspace.undoController.undo()
      await flushAsyncWork()

      expect(readNoteText(workspace.noteDoc)).toBe('before delete after')
      expect(readGroupedMarker(workspace)).toBeUndefined()
    } finally {
      session.cleanup()
    }
  })

  it('undoes a selected-text delete in one Cmd+Z after audit metadata flushes', async () => {
    const session = await createSession('before delete after')

    try {
      const { workspace, editor } = session
      await mountAuditEffectsHarness(workspace, editor)
      vi.spyOn(editor._tiptapEditor, 'isFocused', 'get').mockReturnValue(true)

      const end = findTextRange(editor, 'after').to
      setSelection(editor, end, end)
      insertTextAtSelection(editor, '!')
      await flushAsyncWork()
      await wait(650)
      await flushAsyncWork()

      const firstAudit = readNodeAudit(workspace, 'note-1')
      expect(firstAudit?.updatedAt).toEqual(expect.any(String))
      expect(readNoteText(workspace.noteDoc)).toBe('before delete after!')

      const deleteRange = findTextRange(editor, 'delete ')
      setSelection(editor, deleteRange.from, deleteRange.to)
      deleteSelection(editor)
      await flushAsyncWork()
      await wait(650)
      await flushAsyncWork()

      const secondAudit = readNodeAudit(workspace, 'note-1')
      expect(secondAudit?.updatedAt).toEqual(expect.any(String))
      expect(secondAudit?.updatedAt).not.toBe(firstAudit?.updatedAt)
      expect(readNoteText(workspace.noteDoc)).toBe('before after!')

      workspace.undoController.undo()
      await flushAsyncWork()

      expect(readNoteText(workspace.noteDoc)).toBe('before delete after!')
    } finally {
      session.cleanup()
    }
  })

  it('keeps persisted selection highlight transactions out of the doc and undo history', async () => {
    const workspace = await createWorkspace('note-1', 'Kanwas', 'before delete after')
    const { editor, cleanup: cleanupEditor } = await createCollaborativeEditor(workspace, {
      extensions: [PersistSelectionExtension as never],
    })
    const tiptap = editor._tiptapEditor
    const initialUndoStackLength = workspace.undoController.undoManager.undoStack.length
    const initialOperationId = workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)
    let noteUpdateCount = 0
    const handleUpdate = () => {
      noteUpdateCount += 1
    }
    workspace.noteDoc.on('update', handleUpdate)

    try {
      const deleteRange = findTextRange(editor, 'delete ')
      setSelection(editor, deleteRange.from, deleteRange.to)
      await flushAsyncWork()

      tiptap.view.dom.dispatchEvent(new Event('blur'))
      await flushAsyncWork()

      tiptap.view.dispatch(
        tiptap.view.state.tr
          .setMeta(persistSelectionKey, { hasFocus: true, from: 0, to: 0 })
          .setMeta('addToHistory', false)
      )
      await flushAsyncWork()

      expect(noteUpdateCount).toBe(0)
      expect(readNoteText(workspace.noteDoc)).toBe('before delete after')
      expect(workspace.undoController.undoManager.undoStack.length).toBe(initialUndoStackLength)
      expect(workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)).toBe(initialOperationId)
    } finally {
      workspace.noteDoc.off('update', handleUpdate)
      cleanupEditor()
      workspace.undoController.destroy()
      workspace.dispose()
      workspace.yDoc.destroy()
    }
  })

  it.each([
    {
      label: 'typing at the cursor',
      initialText: 'hello',
      expectedText: 'hello world',
      applyEdit: (editor: TestEditor) => {
        const end = findTextRange(editor, 'hello').to
        setSelection(editor, end, end)
        insertTextAtSelection(editor, ' world')
      },
    },
    {
      label: 'deleting selected text',
      initialText: 'before delete after',
      expectedText: 'before after',
      applyEdit: (editor: TestEditor) => {
        const deleteRange = findTextRange(editor, 'delete ')
        setSelection(editor, deleteRange.from, deleteRange.to)
        deleteSelection(editor)
      },
    },
  ])('undoes $label together with a grouped workspace mutation', async ({ initialText, expectedText, applyEdit }) => {
    const session = await createSession(initialText)

    try {
      const { workspace, editor } = session

      applyEdit(editor)

      const operationId = workspace.undoController.getRecentOperationIdForDoc(workspace.noteDoc)
      expect(operationId).toEqual(expect.any(String))

      applyGroupedMarker(workspace, operationId!, `grouped:${expectedText}`)

      expect(readNoteText(workspace.noteDoc)).toBe(expectedText)
      expect(readGroupedMarker(workspace)).toBe(`grouped:${expectedText}`)

      workspace.undoController.undo()
      await flushAsyncWork()

      expect(readNoteText(workspace.noteDoc)).toBe(initialText)
      expect(readGroupedMarker(workspace)).toBeUndefined()

      workspace.undoController.redo()
      await flushAsyncWork()

      expect(readNoteText(workspace.noteDoc)).toBe(expectedText)
      expect(readGroupedMarker(workspace)).toBe(`grouped:${expectedText}`)
    } finally {
      session.cleanup()
    }
  })
})
