import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { useWorkspace } from '@/providers/workspace'
import { type BlockNoteCollaborationProvider } from '@/lib/blocknote-collaboration'
import { useTheme } from '@/providers/theme'
import { useBlockNoteAuditEffects } from '@/hooks/useBlockNoteAuditEffects'
import { useBlockNoteCollaborationUserInfo } from '@/hooks/useBlockNoteCollaborationUserInfo'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { findCanonicalKanwasNodeId } from '@/lib/workspaceUtils'
import { useFocusModeLayout } from './useFocusModeLayout'
import { useFocusMode } from '@/store/useUIStore'
import * as Y from 'yjs'

// Exit threshold for pinch gesture (prevents accidental exits)
const PINCH_EXIT_THRESHOLD = 10

interface FocusModeOverlayProps {
  nodeId: string
  nodeType: 'blockNote'
  onExit: () => void
  skipEnterAnimation?: boolean
}

/**
 * Inner BlockNote editor for focus mode.
 * Separated so it can remount when fragment changes.
 */
function FocusBlockNoteEditor({
  nodeId,
  fragment,
  provider,
  undoManager,
  isKanwasProtected,
}: {
  nodeId: string
  fragment: Y.XmlFragment
  provider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
  isKanwasProtected: boolean
}) {
  const { theme } = useTheme()
  const { localUser, workspaceUndoController } = useWorkspace()

  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    collaboration: {
      provider,
      fragment,
      user: {
        name: localUser.name,
        color: localUser.color,
      },
      undoManager,
    },
    _tiptapOptions: {
      editorProps: {
        handleKeyDown: (_view, event) => {
          const isModKey = event.metaKey || event.ctrlKey
          if (!isModKey || event.altKey || event.key.toLowerCase() !== 'z') {
            return false
          }

          event.preventDefault()

          if (event.shiftKey) {
            workspaceUndoController.redo()
          } else {
            workspaceUndoController.undo()
          }

          return true
        },
      },
    },
  })

  useBlockNoteCollaborationUserInfo(editor, localUser)
  useBlockNoteAuditEffects({ editor, nodeId, isKanwasProtected })

  return (
    <BlockNoteView editor={editor} theme={theme.mode} sideMenu={false} slashMenu={false} formattingToolbar={false} />
  )
}

/**
 * Focus mode overlay component.
 * Renders focused document content in a separate layer above the hidden canvas.
 */
export const FocusModeOverlay = memo(function FocusModeOverlay({
  nodeId,
  onExit,
  skipEnterAnimation = false,
}: FocusModeOverlayProps) {
  const { store } = useWorkspace()
  const { fragment, editorKey, collaborationProvider, undoManager } = useNoteBlockNoteBinding(nodeId, {
    awarenessEnabled: true,
  })
  const { isExiting } = useFocusMode()
  const layout = useFocusModeLayout()
  const [animationState, setAnimationState] = useState<'entering' | 'visible' | 'exiting'>(
    skipEnterAnimation ? 'visible' : 'entering'
  )
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const isKanwasProtected = store.root ? findCanonicalKanwasNodeId(store.root) === nodeId : false

  // Handle enter animation
  useEffect(() => {
    // Start visible on next frame for CSS transition
    requestAnimationFrame(() => {
      setAnimationState('visible')
    })
  }, [])

  // Handle exit animation
  useEffect(() => {
    if (isExiting) {
      setAnimationState('exiting')
    }
  }, [isExiting])

  // Track if exit has been triggered to prevent multiple calls
  const exitTriggeredRef = useRef(false)

  // Pinch-to-exit gesture handler
  useEffect(() => {
    exitTriggeredRef.current = false // Reset on mount

    const handleWheel = (e: WheelEvent) => {
      // Only handle trackpad pinch (ctrlKey is set for pinch gestures)
      if (!e.ctrlKey) return

      // Prevent default to stop ReactFlow from zooming
      e.preventDefault()

      // Pinch-out (zoom out) has positive deltaY
      if (e.deltaY > PINCH_EXIT_THRESHOLD && !exitTriggeredRef.current) {
        exitTriggeredRef.current = true
        onExit()
      }
      // Pinch-in is ignored (do nothing)
    }

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => document.removeEventListener('wheel', handleWheel, { capture: true })
  }, [onExit])

  // Prevent scroll events from propagating to ReactFlow
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Allow normal scrolling, just stop propagation
    e.stopPropagation()
  }, [])

  return (
    <div
      className={`focus-mode-overlay ${animationState}`}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'var(--editor)',
        zIndex: 20,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: layout.topOffset,
        // Offset left to account for right sidebar (center in full viewport)
        paddingRight: layout.rightSidebarOffset * 2,
      }}
    >
      {/* Scroll container - centered with CSS, responsive width */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        style={{
          width: '100%',
          maxWidth: layout.documentWidth,
          maxHeight: layout.maxHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Document content */}
        <div
          style={{
            padding: '24px',
            paddingTop: '8px',
          }}
        >
          {fragment ? (
            <FocusBlockNoteEditor
              key={editorKey}
              nodeId={nodeId}
              fragment={fragment}
              provider={collaborationProvider}
              undoManager={undoManager}
              isKanwasProtected={isKanwasProtected}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})
