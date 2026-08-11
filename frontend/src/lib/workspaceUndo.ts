import { VALTIO_Y_ORIGIN } from 'valtio-y'
import { ySyncPluginKey } from 'y-prosemirror'
import { YMultiDocUndoManager } from 'y-utility/y-multidoc-undomanager'
import * as Y from 'yjs'
import { findNoteBlockNoteFragment, findWorkspaceNotesMap, getNoteContentKind } from '@/lib/workspaceNoteDoc'

const STACK_ITEM_META_OPERATION_ID = 'workspace-operation-id'
const WORKSPACE_TOMBSTONE_RESTORE_ORIGIN = { kind: 'workspace-tombstone-restore-origin' }

export const WORKSPACE_NOTE_COMMAND_ORIGIN = { kind: 'workspace-note-command-origin' }

type InternalUndoSuppressionReason = 'pending-placement' | 'audit-touch' | 'kanwas-explicit-edit'

type UndoStackItem = {
  meta: Map<unknown, unknown>
}

type UndoStackChange = {
  stackItem: UndoStackItem
  type: 'undo' | 'redo'
  origin?: unknown
  ydoc?: Y.Doc
}

type UndoStackSnapshot = {
  totalUndoStackLength: number
  docUndoStackLengths: Map<Y.Doc, number>
}

export interface EditorUndoRecord {
  operationId: string
  version: number
}

type DocUndoManagerLike = {
  undoStack: UndoStackItem[]
  redoStack: UndoStackItem[]
}

function readOperationId(stackItem: UndoStackItem | undefined): string | null {
  const operationId = stackItem?.meta?.get(STACK_ITEM_META_OPERATION_ID)
  return typeof operationId === 'string' ? operationId : null
}

function assignOperationId(stackItem: UndoStackItem, operationId: string | null): void {
  if (!operationId) {
    return
  }

  stackItem.meta.set(STACK_ITEM_META_OPERATION_ID, operationId)
}

export class WorkspaceUndoController {
  readonly undoManager: YMultiDocUndoManager

  private activeOperationId: string | null = null
  private nextOperationId = 1
  private pendingTransferOperationId: string | null = null
  private pendingTransferTarget: 'redo' | 'undo' | null = null
  private readonly destroyUndoManager: (() => void) | undefined
  private readonly observedNoteDocs = new Map<Y.Doc, () => void>()
  private readonly trackedNoteScopes = new WeakMap<Y.Doc, Y.AbstractType<unknown>>()
  private trackedNotesMap: Y.Map<Y.Doc> | null = null
  private readonly deletedNoteDocs = new Map<string, Y.Doc>()
  private readonly pendingInternalUndoSuppressions: InternalUndoSuppressionReason[] = []
  private readonly recentEditorUndoRecordByDoc = new WeakMap<Y.Doc, EditorUndoRecord>()

  constructor(private readonly rootDoc: Y.Doc) {
    this.undoManager = new YMultiDocUndoManager(rootDoc.getMap('state'), {
      trackedOrigins: new Set([VALTIO_Y_ORIGIN, ySyncPluginKey, WORKSPACE_NOTE_COMMAND_ORIGIN]),
      captureTransaction: (transaction: Y.Transaction) => transaction.meta.get('addToHistory') !== false,
    })

    this.destroyUndoManager = (this.undoManager as { destroy?: () => void }).destroy
    ;(this.undoManager as { destroy?: () => void }).destroy = () => {}

    this.undoManager.on('stack-item-added', this.handleStackItemAdded)
    this.undoManager.on('stack-item-updated', this.handleStackItemUpdated)
    rootDoc.on('afterTransaction', this.handleRootTransaction)
    this.syncNoteScopes()
  }

  destroy(): void {
    this.undoManager.off('stack-item-added', this.handleStackItemAdded)
    this.undoManager.off('stack-item-updated', this.handleStackItemUpdated)
    this.rootDoc.off('afterTransaction', this.handleRootTransaction)

    for (const teardown of this.observedNoteDocs.values()) {
      teardown()
    }
    this.observedNoteDocs.clear()

    if (this.destroyUndoManager) {
      ;(this.undoManager as { destroy?: () => void }).destroy = this.destroyUndoManager
      this.destroyUndoManager.call(this.undoManager)
    }
  }

  rememberDeletedNoteDoc(noteId: string, noteDoc: Y.Doc): void {
    this.deletedNoteDocs.set(noteId, noteDoc)
  }

  undo(): void {
    this.undoManager.stopCapturing()
    const operationId = this.peekOperationId('undo', this.undoManager.undoStack as unknown as DocUndoManagerLike[])

    this.applyLogicalOperation('undo', operationId)
    this.restoreDeletedNoteDocsForExistingNotes()
    this.undoManager.stopCapturing()
  }

  redo(): void {
    this.undoManager.stopCapturing()
    const operationId = this.peekOperationId('redo', this.undoManager.redoStack as unknown as DocUndoManagerLike[])

    this.applyLogicalOperation('redo', operationId)
    this.undoManager.stopCapturing()
  }

  stopCapturing(): void {
    this.undoManager.stopCapturing()
  }

  runCommand<T>(fn: () => T): T {
    return this.runWithOperationId(`workspace-op-${this.nextOperationId++}`, fn)
  }

  runWithOperationId<T>(operationId: string, fn: () => T): T {
    const undoStackSnapshot = this.captureUndoStackSnapshot()
    const previousOperationId = this.activeOperationId
    this.activeOperationId = operationId
    this.undoManager.stopCapturing()

    try {
      return fn()
    } finally {
      queueMicrotask(() => {
        this.assignOperationIdToNewUndoItems(undoStackSnapshot, operationId)
      })
      this.undoManager.stopCapturing()
      this.activeOperationId = previousOperationId
    }
  }

  getRecentOperationIdForDoc(doc: Y.Doc): string | null {
    return this.getRecentEditorUndoRecordForDoc(doc)?.operationId ?? null
  }

  getRecentEditorUndoRecordForDoc(doc: Y.Doc): EditorUndoRecord | null {
    const record = this.recentEditorUndoRecordByDoc.get(doc)
    return record ? { ...record } : null
  }

  runWithoutUndoTracking<T>(
    reason: InternalUndoSuppressionReason,
    fn: () => T,
    shouldSuppress: (result: T) => boolean
  ): T {
    const undoStackSnapshot = this.captureUndoStackSnapshot()
    this.undoManager.stopCapturing()
    this.pendingInternalUndoSuppressions.push(reason)

    let suppressPendingStackItem = false

    try {
      const result = fn()
      suppressPendingStackItem = shouldSuppress(result)

      if (suppressPendingStackItem) {
        queueMicrotask(() => {
          this.restoreUndoStackSnapshot(undoStackSnapshot)
        })
      }

      return result
    } finally {
      this.undoManager.stopCapturing()

      if (!suppressPendingStackItem) {
        const suppressionIndex = this.pendingInternalUndoSuppressions.lastIndexOf(reason)
        if (suppressionIndex >= 0) {
          this.pendingInternalUndoSuppressions.splice(suppressionIndex, 1)
        }
      }
    }
  }

  private readonly handleStackItemAdded = ({ stackItem, type, origin, ydoc }: UndoStackChange) => {
    if (type === 'undo' && this.pendingInternalUndoSuppressions.length > 0) {
      this.dropStackItem(type, stackItem, ydoc)
      this.pendingInternalUndoSuppressions.pop()
      return
    }

    let assignedOperationId = readOperationId(stackItem)

    if (type === 'undo' && this.activeOperationId) {
      assignedOperationId = this.activeOperationId
      assignOperationId(stackItem, assignedOperationId)
    } else if (
      this.pendingTransferOperationId &&
      ((type === 'redo' && this.pendingTransferTarget === 'redo') ||
        (type === 'undo' && this.pendingTransferTarget === 'undo'))
    ) {
      assignedOperationId = this.pendingTransferOperationId
      assignOperationId(stackItem, assignedOperationId)
    } else if (this.isEditorOriginUndoChange({ stackItem, type, origin, ydoc })) {
      assignedOperationId = assignedOperationId ?? `workspace-op-${this.nextOperationId++}`
      assignOperationId(stackItem, assignedOperationId)
    }

    this.rememberEditorUndoRecord({ stackItem, type, origin, ydoc }, assignedOperationId)
  }

  private readonly handleStackItemUpdated = ({ stackItem, type, origin, ydoc }: UndoStackChange) => {
    let assignedOperationId = readOperationId(stackItem)
    const change = { stackItem, type, origin, ydoc }

    if (type === 'undo' && this.activeOperationId) {
      assignedOperationId = this.activeOperationId
      assignOperationId(stackItem, assignedOperationId)
    } else if (
      this.pendingTransferOperationId &&
      ((type === 'redo' && this.pendingTransferTarget === 'redo') ||
        (type === 'undo' && this.pendingTransferTarget === 'undo'))
    ) {
      assignedOperationId = this.pendingTransferOperationId
      assignOperationId(stackItem, assignedOperationId)
    } else if (this.isEditorOriginUndoChange(change) && !assignedOperationId) {
      assignedOperationId = `workspace-op-${this.nextOperationId++}`
      assignOperationId(stackItem, assignedOperationId)
    }

    this.rememberEditorUndoRecord(change, assignedOperationId)
  }

  private readonly handleRootTransaction = () => {
    this.syncNoteScopes()
  }

  private syncNoteScopes(): void {
    const notesMap = findWorkspaceNotesMap(this.rootDoc)
    if (!notesMap) {
      this.teardownDetachedNoteObservers(new Set())
      return
    }

    if (this.trackedNotesMap !== notesMap) {
      this.undoManager.addToScope([notesMap])
      this.trackedNotesMap = notesMap
    }

    const currentNoteDocs = new Set<Y.Doc>()
    for (const noteDoc of notesMap.values()) {
      currentNoteDocs.add(noteDoc)
      this.observeNoteDoc(noteDoc)
      this.trackNoteDoc(noteDoc)
    }

    this.teardownDetachedNoteObservers(currentNoteDocs)
  }

  private isEditorOriginUndoChange(change: UndoStackChange): boolean {
    return change.type === 'undo' && change.origin === ySyncPluginKey && change.ydoc instanceof Y.Doc
  }

  private rememberEditorUndoRecord(change: UndoStackChange, operationId: string | null): void {
    if (!operationId || !this.isEditorOriginUndoChange(change) || !change.ydoc) {
      return
    }

    const previous = this.recentEditorUndoRecordByDoc.get(change.ydoc)
    this.recentEditorUndoRecordByDoc.set(change.ydoc, {
      operationId,
      version: (previous?.version ?? 0) + 1,
    })
  }

  private observeNoteDoc(noteDoc: Y.Doc): void {
    if (this.observedNoteDocs.has(noteDoc)) {
      return
    }

    const handleNoteTransaction = () => {
      this.trackNoteDoc(noteDoc)
    }

    noteDoc.on('afterTransaction', handleNoteTransaction)
    this.observedNoteDocs.set(noteDoc, () => {
      noteDoc.off('afterTransaction', handleNoteTransaction)
    })
  }

  private teardownDetachedNoteObservers(currentNoteDocs: Set<Y.Doc>): void {
    for (const [noteDoc, teardown] of Array.from(this.observedNoteDocs.entries())) {
      if (currentNoteDocs.has(noteDoc)) {
        continue
      }

      teardown()
      this.observedNoteDocs.delete(noteDoc)
    }
  }

  private restoreDeletedNoteDocsForExistingNotes(): void {
    const notesMap = findWorkspaceNotesMap(this.rootDoc)
    if (!notesMap) {
      return
    }

    const expectedNoteIds = collectExpectedNoteIdsFromState(this.rootDoc.getMap('state').toJSON().root)
    const noteIdsToRestore = expectedNoteIds.filter((noteId) => {
      const deletedNoteDoc = this.deletedNoteDocs.get(noteId)
      if (!deletedNoteDoc) {
        return false
      }

      return notesMap.get(noteId) !== deletedNoteDoc
    })
    if (noteIdsToRestore.length === 0) {
      return
    }

    this.rootDoc.transact(() => {
      for (const noteId of noteIdsToRestore) {
        const noteDoc = this.deletedNoteDocs.get(noteId)
        if (!noteDoc) {
          continue
        }

        notesMap.set(noteId, noteDoc)
        this.trackNoteDoc(noteDoc)
      }
    }, WORKSPACE_TOMBSTONE_RESTORE_ORIGIN)
  }

  private trackNoteDoc(noteDoc: Y.Doc): void {
    const noteKind = getNoteContentKind(noteDoc)
    if (!noteKind) {
      return
    }

    const scope = findNoteBlockNoteFragment(noteDoc)
    if (!scope) {
      return
    }

    if (this.trackedNoteScopes.get(noteDoc) === scope) {
      return
    }

    const trackedScope = scope as unknown as Y.AbstractType<unknown>
    this.undoManager.addToScope([trackedScope])
    this.trackedNoteScopes.set(noteDoc, trackedScope)
  }

  private applyLogicalOperation(kind: 'undo' | 'redo', operationId: string | null): void {
    const stack =
      kind === 'undo'
        ? (this.undoManager.undoStack as unknown as UndoStackItem[])
        : (this.undoManager.redoStack as unknown as UndoStackItem[])
    const apply = kind === 'undo' ? () => this.undoManager.undo() : () => this.undoManager.redo()
    const transferTarget = kind === 'undo' ? 'redo' : 'undo'

    this.prepareTransfer(operationId, transferTarget)
    apply()
    this.clearTransfer()

    if (!operationId) {
      return
    }

    while (this.peekOperationId(kind, stack as unknown as DocUndoManagerLike[]) === operationId) {
      this.prepareTransfer(operationId, transferTarget)
      apply()
      this.clearTransfer()
    }
  }

  private prepareTransfer(operationId: string | null, target: 'redo' | 'undo'): void {
    this.pendingTransferOperationId = operationId
    this.pendingTransferTarget = target
  }

  private clearTransfer(): void {
    this.pendingTransferOperationId = null
    this.pendingTransferTarget = null
  }

  private peekOperationId(kind: 'undo' | 'redo', stack: DocUndoManagerLike[]): string | null {
    const docUndoManager = stack[stack.length - 1]
    if (!docUndoManager) {
      return null
    }

    const docStack = kind === 'undo' ? docUndoManager.undoStack : docUndoManager.redoStack
    return readOperationId(docStack[docStack.length - 1])
  }

  private dropStackItem(type: 'undo' | 'redo', stackItem: UndoStackItem, ydoc?: Y.Doc): void {
    const stack =
      type === 'undo'
        ? (this.undoManager.undoStack as unknown as Array<{ doc?: Y.Doc }>)
        : (this.undoManager.redoStack as unknown as Array<{ doc?: Y.Doc }>)

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (!ydoc || stack[index]?.doc === ydoc) {
        stack.splice(index, 1)
        break
      }
    }

    if (!ydoc) {
      return
    }

    const docs = (this.undoManager as unknown as { docs?: Map<Y.Doc, Y.UndoManager> }).docs
    const docUndoManager = docs?.get(ydoc)
    if (!docUndoManager) {
      return
    }

    const docStack = type === 'undo' ? docUndoManager.undoStack : docUndoManager.redoStack
    for (let index = docStack.length - 1; index >= 0; index -= 1) {
      if ((docStack[index] as unknown as UndoStackItem) === stackItem) {
        docStack.splice(index, 1)
        break
      }
    }
  }

  private captureUndoStackSnapshot(): UndoStackSnapshot {
    const docs = (this.undoManager as unknown as { docs?: Map<Y.Doc, Y.UndoManager> }).docs

    return {
      totalUndoStackLength: this.undoManager.undoStack.length,
      docUndoStackLengths: new Map(
        docs ? Array.from(docs.entries(), ([ydoc, undoManager]) => [ydoc, undoManager.undoStack.length]) : []
      ),
    }
  }

  private restoreUndoStackSnapshot(snapshot: UndoStackSnapshot): void {
    while (this.undoManager.undoStack.length > snapshot.totalUndoStackLength) {
      this.undoManager.undoStack.pop()
    }

    const docs = (this.undoManager as unknown as { docs?: Map<Y.Doc, Y.UndoManager> }).docs
    if (!docs) {
      return
    }

    for (const [ydoc, baselineLength] of snapshot.docUndoStackLengths) {
      const docUndoManager = docs.get(ydoc)
      if (!docUndoManager) {
        continue
      }

      while (docUndoManager.undoStack.length > baselineLength) {
        docUndoManager.undoStack.pop()
      }
    }
  }

  private assignOperationIdToNewUndoItems(snapshot: UndoStackSnapshot, operationId: string): void {
    const docs = (this.undoManager as unknown as { docs?: Map<Y.Doc, Y.UndoManager> }).docs
    if (!docs) {
      return
    }

    const topLevelUndoStack = this.undoManager.undoStack as unknown as Array<{ doc?: Y.Doc }>
    for (let index = snapshot.totalUndoStackLength; index < topLevelUndoStack.length; index += 1) {
      const ydoc = topLevelUndoStack[index]?.doc
      if (!ydoc) {
        continue
      }

      const docUndoManager = docs.get(ydoc)
      const stackItem = docUndoManager?.undoStack[docUndoManager.undoStack.length - 1] as UndoStackItem | undefined
      if (stackItem) {
        assignOperationId(stackItem, operationId)
      }
    }

    for (const [ydoc, docUndoManager] of docs.entries()) {
      const baselineLength = snapshot.docUndoStackLengths.get(ydoc) ?? 0
      for (let index = baselineLength; index < docUndoManager.undoStack.length; index += 1) {
        assignOperationId(docUndoManager.undoStack[index] as unknown as UndoStackItem, operationId)
      }
    }
  }
}

function collectExpectedNoteIdsFromState(rootValue: unknown): string[] {
  if (!rootValue || typeof rootValue !== 'object') {
    return []
  }

  const noteIds = new Set<string>()
  const stack: unknown[] = [rootValue]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') {
      continue
    }

    const item = current as {
      kind?: unknown
      id?: unknown
      items?: unknown
      xynode?: { type?: unknown }
    }

    if (
      item.kind === 'node' &&
      typeof item.id === 'string' &&
      (item.xynode?.type === 'blockNote' || item.xynode?.type === 'stickyNote')
    ) {
      noteIds.add(item.id)
    }

    if (Array.isArray(item.items)) {
      for (const child of item.items) {
        stack.push(child)
      }
    }
  }

  return Array.from(noteIds)
}
