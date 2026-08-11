import { useCallback, useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { ySyncPluginKey } from 'y-prosemirror'
import type * as Y from 'yjs'
import { VALTIO_Y_ORIGIN } from 'valtio-y'
import { useWorkspace } from '@/providers/workspace'
import { useAuthState } from '@/providers/auth'
import { useDebouncedAuditTouch } from '@/hooks/useDebouncedAuditTouch'
import { createUserAuditActor, shouldTouchAuditFromBlockNoteTransaction } from '@/lib/workspaceAudit'
import { markKanwasNodeAsExplicitlyEdited } from '@/lib/workspaceUtils'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

interface UseBlockNoteAuditEffectsOptions {
  editor: BlockNoteEditorInstance
  nodeId: string
  isKanwasProtected: boolean
}

export function useBlockNoteAuditEffects({ editor, nodeId, isKanwasProtected }: UseBlockNoteAuditEffectsOptions) {
  const { store, yDoc, workspaceUndoController } = useWorkspace()
  const { user: authUser } = useAuthState()
  const transactionBaselineVersionByDocRef = useRef<WeakMap<Y.Doc, number>>(new WeakMap())
  const auditActor = createUserAuditActor(authUser?.id)
  const runInWorkspaceTransaction = useCallback(
    <T>(fn: () => T): T => {
      let result!: T
      yDoc.transact(() => {
        result = fn()
      }, VALTIO_Y_ORIGIN)
      return result
    },
    [yDoc]
  )
  const { scheduleTouch: scheduleAuditTouch, flushTouch: flushAuditTouch } = useDebouncedAuditTouch({
    root: store.root,
    nodeId,
    actor: auditActor,
    transact: (fn) => runInWorkspaceTransaction(fn),
    runWithOperationId: (operationId, fn) => workspaceUndoController.runWithOperationId(operationId, fn),
    runWithoutUndoTracking: (fn, shouldSuppress) =>
      workspaceUndoController.runWithoutUndoTracking('audit-touch', fn, shouldSuppress),
  })

  const getEditorDoc = useCallback(() => {
    const ySyncState = ySyncPluginKey.getState(editor._tiptapEditor.state) as { doc?: Y.Doc } | undefined
    return ySyncState?.doc ?? null
  }, [editor])

  const markKanwasAsExplicitlyEdited = useCallback(
    (operationId: string | null) => {
      if (!isKanwasProtected || !store.root) {
        return
      }

      const apply = () => runInWorkspaceTransaction(() => markKanwasNodeAsExplicitlyEdited(store.root!, nodeId))

      if (operationId) {
        workspaceUndoController.runWithOperationId(operationId, apply)
        return
      }

      workspaceUndoController.runWithoutUndoTracking('kanwas-explicit-edit', apply, (didChange) => didChange === true)
    },
    [isKanwasProtected, nodeId, runInWorkspaceTransaction, store.root, workspaceUndoController]
  )

  useEffect(() => {
    const tiptap = editor._tiptapEditor
    const handleBeforeTransaction = () => {
      const noteDoc = getEditorDoc()
      if (!noteDoc) {
        return
      }

      const record = workspaceUndoController.getRecentEditorUndoRecordForDoc(noteDoc)
      transactionBaselineVersionByDocRef.current.set(noteDoc, record?.version ?? 0)
    }

    tiptap.on('beforeTransaction', handleBeforeTransaction as never)

    return () => {
      tiptap.off('beforeTransaction', handleBeforeTransaction as never)
    }
  }, [editor, getEditorDoc, workspaceUndoController])

  useEffect(() => {
    const tiptap = editor._tiptapEditor
    const handleBlur = () => {
      flushAuditTouch()
    }

    tiptap.on('blur', handleBlur)

    return () => {
      tiptap.off('blur', handleBlur)
    }
  }, [editor, flushAuditTouch])

  useEffect(() => {
    const tiptap = editor._tiptapEditor
    const handleTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean; getMeta: (key: unknown) => unknown }
    }) => {
      const ySyncMeta = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined

      if (
        !shouldTouchAuditFromBlockNoteTransaction({
          docChanged: transaction.docChanged,
          isFocused: tiptap.isFocused,
          isYSyncChangeOrigin: ySyncMeta?.isChangeOrigin === true,
        })
      ) {
        return
      }

      const noteDoc = getEditorDoc()
      const baselineVersion = noteDoc
        ? (transactionBaselineVersionByDocRef.current.get(noteDoc) ??
          workspaceUndoController.getRecentEditorUndoRecordForDoc(noteDoc)?.version ??
          0)
        : 0

      queueMicrotask(() => {
        const latestRecord = noteDoc ? workspaceUndoController.getRecentEditorUndoRecordForDoc(noteDoc) : null
        const operationId = latestRecord && latestRecord.version > baselineVersion ? latestRecord.operationId : null

        if (noteDoc && latestRecord) {
          transactionBaselineVersionByDocRef.current.set(noteDoc, latestRecord.version)
        }

        scheduleAuditTouch(operationId)

        if (isKanwasProtected) {
          markKanwasAsExplicitlyEdited(operationId)
        }
      })
    }

    tiptap.on('transaction', handleTransaction as never)

    return () => {
      tiptap.off('transaction', handleTransaction as never)
    }
  }, [
    editor,
    getEditorDoc,
    isKanwasProtected,
    markKanwasAsExplicitlyEdited,
    scheduleAuditTouch,
    workspaceUndoController,
  ])
}
