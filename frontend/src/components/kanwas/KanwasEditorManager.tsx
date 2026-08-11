import { useEffect, useMemo } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { useSnapshot } from 'valtio/react'
import type { CanvasItem } from 'shared'
import * as Y from 'yjs'
import { useWorkspace } from '@/providers/workspace'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { useBlockNoteCollaborationUserInfo } from '@/hooks/useBlockNoteCollaborationUserInfo'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { useClearMountedKanwasEditor, useSetMountedKanwasEditor } from '@/providers/project-state'
import { findCanonicalKanwasNode } from '@/lib/workspaceUtils'

function MountedKanwasEditor({
  editorNodeId,
  fragment,
  collaborationProvider,
  undoManager,
}: {
  editorNodeId: string
  fragment: Y.XmlFragment
  collaborationProvider: ReturnType<typeof useNoteBlockNoteBinding>['collaborationProvider']
  undoManager: Y.UndoManager
}) {
  const setMountedKanwasEditor = useSetMountedKanwasEditor()
  const clearMountedKanwasEditor = useClearMountedKanwasEditor()
  const { localUser } = useWorkspace()

  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    collaboration: {
      provider: collaborationProvider,
      fragment,
      user: {
        name: localUser.name,
        color: localUser.color,
      },
      undoManager,
    },
  })

  useBlockNoteCollaborationUserInfo(editor, localUser)

  useEffect(() => {
    setMountedKanwasEditor(editorNodeId, editor as never)

    return () => {
      clearMountedKanwasEditor(editorNodeId)
    }
  }, [editorNodeId, editor, setMountedKanwasEditor, clearMountedKanwasEditor])

  return (
    <div aria-hidden className="hidden">
      <BlockNoteView editor={editor as never} formattingToolbar={false} />
    </div>
  )
}

function MountedKanwasEditorWithFragment({ editorNodeId }: { editorNodeId: string }) {
  const { fragment, editorKey, collaborationProvider, undoManager } = useNoteBlockNoteBinding(editorNodeId, {
    awareness: 'isolated',
  })

  if (!fragment) {
    return null
  }

  return (
    <MountedKanwasEditor
      key={editorKey}
      editorNodeId={editorNodeId}
      fragment={fragment}
      collaborationProvider={collaborationProvider}
      undoManager={undoManager}
    />
  )
}

export function KanwasEditorManager() {
  const { store } = useWorkspace()
  const workspaceSnapshot = useSnapshot(store)
  const clearMountedKanwasEditor = useClearMountedKanwasEditor()
  const rootCanvas = workspaceSnapshot.root as CanvasItem | null

  const canonicalKanwasNode = useMemo(() => {
    if (!rootCanvas) {
      return null
    }

    return findCanonicalKanwasNode(rootCanvas)
  }, [rootCanvas])

  const canonicalEditorNodeId = canonicalKanwasNode?.node.xynode.id ?? null

  useEffect(() => {
    if (!canonicalEditorNodeId) {
      clearMountedKanwasEditor()
    }
  }, [canonicalEditorNodeId, clearMountedKanwasEditor])

  if (!canonicalEditorNodeId) {
    return null
  }

  return <MountedKanwasEditorWithFragment key={canonicalEditorNodeId} editorNodeId={canonicalEditorNodeId} />
}
