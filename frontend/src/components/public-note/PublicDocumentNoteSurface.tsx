import { useEffect, useRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import type { ActivePublicDocumentShare } from 'shared/document-share'
import type * as Y from 'yjs'
import { BlockNoteEditorErrorBoundary } from '@/components/note-editors/BlockNoteEditorErrorBoundary'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { buildAppPath } from '@/lib/appPaths'
import { guestAwarenessIdentityManager } from '@/lib/guestAwarenessIdentity'
import { createPasteHandler } from '@/lib/paste-utils'
import { findWorkspaceInterlinkElement, readWorkspaceInterlinkDomInfo } from '@/lib/workspaceInterlinkEditor'
import { useTheme } from '@/providers/theme'
import type { BlockNoteCollaborationProvider } from '@/lib/blocknote-collaboration'

interface PublicDocumentNoteSurfaceProps {
  share: ActivePublicDocumentShare
  fragment: Y.XmlFragment
  editorKey: string
  collaborationProvider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
}

function resolveWorkspaceInterlinkTarget(href: string, workspaceRedirectPath: string): string {
  try {
    const target = new URL(href, window.location.origin)
    const workspacePathPrefix = buildAppPath('/w/')

    if (
      target.origin === window.location.origin &&
      (target.pathname.startsWith('/w/') || target.pathname.startsWith(workspacePathPrefix))
    ) {
      return buildAppPath(`${target.pathname}${target.search}${target.hash}`)
    }
  } catch {
    // Fall back to the workspace root when the inline href is not a valid Kanwas path.
  }

  return buildAppPath(workspaceRedirectPath)
}

function PublicDocumentEditor({
  fragment,
  provider,
  undoManager,
  share,
}: {
  fragment: Y.XmlFragment
  provider: BlockNoteCollaborationProvider
  undoManager: Y.UndoManager
  share: ActivePublicDocumentShare
}) {
  const guest = guestAwarenessIdentityManager.getGuest()
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const isEditable = share.accessMode === 'editable'
  const { themeMode } = useTheme()
  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    collaboration: {
      provider,
      fragment,
      user: {
        name: guest.name,
        color: guest.color,
      },
      undoManager,
    },
    ...(isEditable
      ? {
          pasteHandler: createPasteHandler(),
        }
      : {}),
  })

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) {
      return
    }

    const handleClickCapture = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const interlinkElement = findWorkspaceInterlinkElement(event.target)
      if (!interlinkElement) {
        return
      }

      const domInfo = readWorkspaceInterlinkDomInfo(interlinkElement)
      if (!domInfo) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      window.location.assign(resolveWorkspaceInterlinkTarget(domInfo.href, share.workspaceRedirectPath))
    }

    container.addEventListener('click', handleClickCapture, true)
    return () => {
      container.removeEventListener('click', handleClickCapture, true)
    }
  }, [share.workspaceRedirectPath])

  return (
    <div ref={editorContainerRef} className="w-full bg-white text-foreground transition-colors dark:bg-editor">
      <div className="px-1 py-2 sm:px-4 sm:py-4 lg:px-8 lg:py-6">
        <BlockNoteView
          style={{ minHeight: '60vh' }}
          editor={editor as never}
          theme={themeMode}
          editable={isEditable}
          formattingToolbar={isEditable}
          linkToolbar={isEditable}
          slashMenu={isEditable}
          sideMenu={isEditable}
          filePanel={false}
          tableHandles={isEditable}
          emojiPicker={false}
          comments={false}
        />
      </div>
    </div>
  )
}

export function PublicDocumentNoteSurface({
  share,
  fragment,
  editorKey,
  collaborationProvider,
  undoManager,
}: PublicDocumentNoteSurfaceProps) {
  return (
    <BlockNoteEditorErrorBoundary fragmentKey={editorKey}>
      <PublicDocumentEditor
        key={editorKey}
        fragment={fragment}
        provider={collaborationProvider}
        undoManager={undoManager}
        share={share}
      />
    </BlockNoteEditorErrorBoundary>
  )
}
