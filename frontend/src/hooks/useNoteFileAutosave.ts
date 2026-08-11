// User-edit autosave through the fidelity pipeline (content-plane re-architecture, Mission A3).
// The editor stays fragment-bound for live collab/undo, but a LOCAL edit now also serializes
// the note to markdown and PUTs it to kanwasd, which composes/writes the file atomically and
// is the only writer of note content on disk (see plan/content-plane-rearchitecture.md).
import { useCallback, useEffect, useRef } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import type * as Y from 'yjs'
import { convertWorkspaceInterlinksToLinksInBlocks } from 'shared/workspace-interlink'
import { postProcessExportedMarkdown } from 'shared/markdown-fidelity'
import { daemonFetch } from '@/components/terminal/useTerminalSessions'
import { useWorkspace } from '@/providers/workspace'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

interface UseNoteFileAutosaveOptions {
  editor: BlockNoteEditorInstance
  nodeId: string
  fragment: Y.XmlFragment
}

type PutResult = { hash: string; relPath: string } | 'conflict' | 'error'

const AUTOSAVE_DEBOUNCE_MS = 600
const AUTOSAVE_MAX_WAIT_MS = 3_000

// Events that count as "genuine user input inside the editor surface" — arms the hook.
// Mount-time BlockNote/y-prosemirror normalization never fires these, so it never arms.
const ARM_EVENT_TYPES = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'compositionstart'] as const

/**
 * Wires a BlockNote editor's note (or sticky) fragment to the daemon's save endpoint.
 * Disarmed until the user's first real input event inside this editor's own DOM; from
 * then on, local Y.Doc updates (not the workspace provider's remote-apply echoes, not
 * mount-time normalization on an editor that never saw input) schedule a debounced save.
 */
export function useNoteFileAutosave({ editor, nodeId, fragment }: UseNoteFileAutosaveOptions): void {
  const { workspaceId, provider } = useWorkspace()

  const armedRef = useRef(false)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastKnownHashRef = useRef<string | undefined>(undefined)
  // Serializes saves so a slow request can't be overtaken by a newer one racing on the
  // same baseHash — the overtaking response would clobber lastKnownHash out of order.
  const inFlightRef = useRef(false)
  const resaveQueuedRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current)
      debounceTimeoutRef.current = null
    }
    if (maxWaitTimeoutRef.current !== null) {
      clearTimeout(maxWaitTimeoutRef.current)
      maxWaitTimeoutRef.current = null
    }
  }, [])

  // A single PUT attempt — serialize, send, classify the response. No retry logic here;
  // performSave below is the only caller and owns the conflict/force decision.
  const putOnce = useCallback(
    async (force: boolean): Promise<PutResult> => {
      try {
        const linkedBlocks = convertWorkspaceInterlinksToLinksInBlocks(editor.document)
        const rawMarkdown = await editor.blocksToMarkdownLossy(linkedBlocks)
        const body = postProcessExportedMarkdown(rawMarkdown)

        const res = await daemonFetch(`/workspaces/${workspaceId}/notes/${nodeId}/content`, {
          method: 'PUT',
          body: JSON.stringify({ body, baseHash: lastKnownHashRef.current, force }),
        })

        if (res.status === 409) {
          return 'conflict'
        }
        if (!res.ok) {
          console.error(`Note autosave failed for ${nodeId}: ${res.status}`)
          return 'error'
        }

        return (await res.json()) as { hash: string; relPath: string }
      } catch (error) {
        console.error(`Note autosave failed for ${nodeId}:`, error)
        return 'error'
      }
    },
    [editor, nodeId, workspaceId]
  )

  const performSave = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      resaveQueuedRef.current = true
      return
    }

    inFlightRef.current = true
    try {
      let result = await putOnce(false)

      // Active user wins: retry once forced. Otherwise disk wins and the daemon's
      // ingest will refresh the fragment — dropping here avoids fighting that refresh.
      if (result === 'conflict' && editor._tiptapEditor.isFocused) {
        result = await putOnce(true)
      }

      if (result !== 'conflict' && result !== 'error') {
        lastKnownHashRef.current = result.hash
      }
    } finally {
      inFlightRef.current = false
      if (resaveQueuedRef.current) {
        resaveQueuedRef.current = false
        void performSave()
      }
    }
  }, [putOnce, editor])

  // Flushes an already-scheduled save immediately; a no-op when nothing is pending
  // (e.g. blur with no edits, or the mount-time StrictMode double-invoke unmount).
  const flush = useCallback(() => {
    const hadPending = debounceTimeoutRef.current !== null || maxWaitTimeoutRef.current !== null
    clearTimers()
    if (hadPending) {
      void performSave()
    }
  }, [clearTimers, performSave])

  const scheduleSave = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null
      flush()
    }, AUTOSAVE_DEBOUNCE_MS)

    if (maxWaitTimeoutRef.current === null) {
      maxWaitTimeoutRef.current = setTimeout(() => {
        maxWaitTimeoutRef.current = null
        flush()
      }, AUTOSAVE_MAX_WAIT_MS)
    }
  }, [flush])

  // Arm on the first genuine user input inside THIS editor's own DOM surface.
  useEffect(() => {
    armedRef.current = false
    const dom = editor._tiptapEditor.view.dom
    const arm = () => {
      armedRef.current = true
    }

    for (const type of ARM_EVENT_TYPES) {
      dom.addEventListener(type, arm)
    }

    return () => {
      armedRef.current = false
      for (const type of ARM_EVENT_TYPES) {
        dom.removeEventListener(type, arm)
      }
    }
  }, [editor])

  // Local edits (while armed) schedule a save; the provider's remote-apply echoes
  // (bootstrap/sync) and edits before arming never do.
  useEffect(() => {
    const doc = fragment.doc
    if (!doc) {
      return
    }

    const handleUpdate = (_update: Uint8Array, origin: unknown) => {
      if (!armedRef.current) {
        return
      }
      if (provider.isRemoteNoteOrigin(nodeId, origin)) {
        return
      }
      scheduleSave()
    }

    doc.on('update', handleUpdate)
    return () => {
      doc.off('update', handleUpdate)
      flush()
    }
  }, [fragment, nodeId, provider, scheduleSave, flush])

  // Flush on blur so a switch away from the editor doesn't leave a save stranded
  // behind the debounce window.
  useEffect(() => {
    const tiptap = editor._tiptapEditor
    tiptap.on('blur', flush)
    return () => {
      tiptap.off('blur', flush)
    }
  }, [editor, flush])
}
