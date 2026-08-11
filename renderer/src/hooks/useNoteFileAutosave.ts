// User-edit autosave through the fidelity pipeline (content-plane re-architecture, Mission A3).
// The editor stays fragment-bound for live collab/undo, but a LOCAL edit now also serializes
// the note to markdown and PUTs it to the local runtime, which writes the file atomically and
// is the only writer of note content on disk.
import { useCallback, useEffect, useRef } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import type * as Y from 'yjs'
import { convertWorkspaceInterlinksToLinksInBlocks } from 'shared/workspace-interlink'
import { postProcessExportedMarkdown } from 'shared/markdown-fidelity'
import { isNoteSaveConflict, localApi, LocalApiError } from '@/api/client'
import { useWorkspace } from '@/providers/workspace'
import { noteSaveCoordinator } from '@/lib/noteSaveCoordinator'

type BlockNoteEditorInstance = ReturnType<typeof useCreateBlockNote>

interface UseNoteFileAutosaveOptions {
  editor: BlockNoteEditorInstance
  nodeId: string
  fragment: Y.XmlFragment
}

type PutResult = { hash: string; relPath: string } | { conflict: true; diskHash: string | null } | 'error'

const AUTOSAVE_DEBOUNCE_MS = 600
const AUTOSAVE_MAX_WAIT_MS = 3_000

// Events that count as "genuine user input inside the editor surface" — arms the hook.
// Mount-time BlockNote/y-prosemirror normalization never fires these, so it never arms.
const ARM_EVENT_TYPES = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'compositionstart'] as const

/**
 * Wires a BlockNote editor's note (or sticky) fragment to the local runtime's save endpoint.
 * Disarmed until the user's first real input event inside this editor's own DOM; from
 * then on, local Y.Doc updates (not the workspace provider's remote-apply echoes, not
 * mount-time normalization on an editor that never saw input) schedule a debounced save.
 */
export function useNoteFileAutosave({ editor, nodeId, fragment }: UseNoteFileAutosaveOptions): void {
  const { workspaceId, provider } = useWorkspace()

  const armedRef = useRef(false)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastKnownHashRef = useRef<string | null | undefined>(undefined)
  const baselinePromiseRef = useRef<Promise<boolean> | null>(null)
  // Serializes saves so a slow request can't be overtaken by a newer one racing on the
  // same baseHash — the overtaking response would clobber lastKnownHash out of order.
  const inFlightRef = useRef<Promise<void> | null>(null)
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

  useEffect(() => {
    let active = true
    lastKnownHashRef.current = undefined
    const loadBaseline = async () => {
      // A newly-created renderer node reaches React before its Yjs update is
      // guaranteed to have crossed the socket and rebuilt the runtime's path
      // mapping. Retry only that transient 404; all other failures stay fatal.
      const retryDelays = [0, 50, 100, 200, 400, 800]
      let lastError: unknown
      for (const delay of retryDelays) {
        if (!active) return null
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
        try {
          return await localApi.getNoteBaseline(workspaceId, nodeId)
        } catch (error) {
          lastError = error
          if (!(error instanceof LocalApiError) || error.status !== 404) throw error
        }
      }
      throw lastError
    }
    const baseline = loadBaseline()
      .then((result) => {
        if (active && result) lastKnownHashRef.current = result.hash
        return active && result !== null
      })
      .catch((error) => {
        console.error(`Could not establish note save baseline for ${nodeId}:`, error)
        return false
      })
    baselinePromiseRef.current = baseline
    return () => {
      active = false
      if (baselinePromiseRef.current === baseline) baselinePromiseRef.current = null
    }
  }, [nodeId, workspaceId])

  // A single PUT attempt — serialize, send, classify the response. No retry logic here;
  // performSave below is the only caller and owns the conflict/force decision.
  const putOnce = useCallback(
    async (force: boolean): Promise<PutResult> => {
      try {
        const baselineReady = await baselinePromiseRef.current
        if (!baselineReady || lastKnownHashRef.current === undefined) return 'error'
        const linkedBlocks = convertWorkspaceInterlinksToLinksInBlocks(editor.document)
        const rawMarkdown = await editor.blocksToMarkdownLossy(linkedBlocks)
        const body = postProcessExportedMarkdown(rawMarkdown)

        return await localApi.saveNote(workspaceId, nodeId, { body, baseHash: lastKnownHashRef.current, force })
      } catch (error) {
        if (isNoteSaveConflict(error)) return { conflict: true, diskHash: error.body.diskHash }
        console.error(`Note autosave failed for ${nodeId}:`, error)
        return 'error'
      }
    },
    [editor, nodeId, workspaceId]
  )

  const performSave = useCallback((): Promise<void> => {
    const activeSave = inFlightRef.current
    if (activeSave) {
      resaveQueuedRef.current = true
      return activeSave
    }

    const save = (async () => {
      do {
        resaveQueuedRef.current = false
        let result = await putOnce(false)

        // Active user wins: retry once forced. Otherwise disk wins and the runtime's
        // ingest refreshes the fragment instead of fighting the external edit.
        if (typeof result === 'object' && 'conflict' in result) {
          lastKnownHashRef.current = result.diskHash
        }
        if (typeof result === 'object' && 'conflict' in result && editor._tiptapEditor.isFocused) {
          result = await putOnce(true)
        }

        if (result !== 'error' && !('conflict' in result)) {
          lastKnownHashRef.current = result.hash
        }
      } while (resaveQueuedRef.current)
    })().finally(() => {
      if (inFlightRef.current === save) inFlightRef.current = null
    })

    inFlightRef.current = save
    return save
  }, [putOnce, editor])

  // Flush scheduled work and await an active request. The app-level shutdown
  // coordinator uses this before acknowledging Electron's prepare-to-quit event.
  const flush = useCallback(async (): Promise<void> => {
    const hadPending = debounceTimeoutRef.current !== null || maxWaitTimeoutRef.current !== null
    clearTimers()
    if (hadPending) {
      await performSave()
      return
    }

    await inFlightRef.current
  }, [clearTimers, performSave])

  useEffect(() => noteSaveCoordinator.register(flush), [flush])

  const scheduleSave = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null
      void flush()
    }, AUTOSAVE_DEBOUNCE_MS)

    if (maxWaitTimeoutRef.current === null) {
      maxWaitTimeoutRef.current = setTimeout(() => {
        maxWaitTimeoutRef.current = null
        void flush()
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

  // Local edits (while armed) schedule a save; incoming transport updates
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
      if (provider.isIncomingNoteOrigin(nodeId, origin)) {
        return
      }
      scheduleSave()
    }

    doc.on('update', handleUpdate)
    return () => {
      doc.off('update', handleUpdate)
      void flush()
    }
  }, [fragment, nodeId, provider, scheduleSave, flush])

  // Flush on blur so a switch away from the editor doesn't leave a save stranded
  // behind the debounce window.
  useEffect(() => {
    const tiptap = editor._tiptapEditor
    const handleBlur = () => void flush()
    tiptap.on('blur', handleBlur)
    return () => {
      tiptap.off('blur', handleBlur)
    }
  }, [editor, flush])
}
