import { BlockNoteView } from '@blocknote/mantine'
import { useUpdateNodeInternals } from '@xyflow/react'
import {
  useCreateBlockNote,
  GenericPopover,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { useSlackMessageEmbed } from '@/hooks/useSlackMessageEmbed'
import { useSetEditor, useRemoveEditor } from '@/providers/project-state'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspaceInterlinks } from '@/providers/workspace-interlinks'
import { NODE_LAYOUT } from 'shared/constants'
import type { BlockNoteNode } from 'shared'
import type { WithCanvasData } from '../types'
import { useTheme } from '@/providers/theme'
import type { ThemeMode } from '@/constants/themes'
import { DocumentName } from './DocumentName'
import { DocumentShareControl } from './DocumentShareControl'
import { BlockNoteFormattingToolbar } from '@/components/note-editors/BlockNoteFormattingToolbar'
import { BlockNoteEditorErrorBoundary } from '@/components/note-editors/BlockNoteEditorErrorBoundary'
import { DetachedMarkdownBlockNote } from '@/components/note-editors/DetachedMarkdownBlockNote'
import { useBlockNoteAuditEffects } from '@/hooks/useBlockNoteAuditEffects'
import { useBlockNoteCollaborationUserInfo } from '@/hooks/useBlockNoteCollaborationUserInfo'
import { useCanvasCursorSuppressionWhileEditorFocused } from '@/hooks/useCanvasCursorSuppression'
import { useBlockNoteTextSelectionSync } from '@/hooks/useBlockNoteTextSelectionSync'
import { useNoteBlockNoteBinding } from '@/hooks/useNoteBlockNoteBinding'
import { blockNoteSchema } from '@/lib/blocknote-schema'
import { type BlockNoteCollaborationProvider } from '@/lib/blocknote-collaboration'
import * as Y from 'yjs'
import { createPasteHandler, handlePasteWithHardBreakDedupe } from '@/lib/paste-utils'
import { PersistSelectionExtension } from '@/lib/persist-selection-extension'
import { useIsFocusModeActive } from '@/store/useUIStore'
import {
  WORKSPACE_INTERLINK_TYPE,
  WORKSPACE_INTERLINK_VERSION,
  createWorkspaceInterlinkProps,
  getWorkspaceInterlinkLabel,
  workspaceInterlinkHrefFromProps,
  type WorkspaceInterlinkProps,
} from 'shared/workspace-interlink'
import { filterWorkspaceInterlinkSuggestions, type WorkspaceInterlinkSuggestion } from '@/lib/workspaceInterlinks'
import {
  WORKSPACE_INTERLINK_MENU_CLOSE_DELAY_MS,
  WORKSPACE_INTERLINK_MENU_VERTICAL_OFFSET_PX,
  findWorkspaceInterlinkElement,
  getElementFromEventTarget,
  readWorkspaceInterlinkDomInfo,
  toSuggestionMenuItems,
  type WorkspaceInterlinkMenuState,
  type WorkspaceInterlinkNodeInfo,
} from '@/lib/workspaceInterlinkEditor'
import { showToast } from '@/utils/toast'
import { useWorkspace } from '@/providers/workspace'
import { NodeActivityPulse } from '@/features/realtime-markdown-activity/NodeActivityPulse'
import { useActivityPulsePresence } from '@/features/realtime-markdown-activity/useActivityPulsePresence'
import { useRealtimeMarkdownNodeActivity } from '@/features/realtime-markdown-activity/useRealtimeMarkdownNodeActivity'
import { logMeasurement } from '@/lib/measurementDebug'

type BlockNoteNodeProps = WithCanvasData<BlockNoteNode>

/**
 * Inner editor component that manages the BlockNote editor instance.
 * This is separated so it can be remounted when fragment identity changes.
 * Normal sync updates are in-place and keep identity stable, but replacement
 * fallback paths still need remount because BlockNote caches fragment refs.
 */
function BlockNoteEditor({
  fragment,
  provider,
  theme,
  id,
  undoManager,
  documentName,
  onWorkspaceLinkNavigate,
  isKanwasProtected,
  workspaceId,
}: {
  fragment: Y.XmlFragment
  provider: BlockNoteCollaborationProvider
  theme: ThemeMode
  id: string
  undoManager: Y.UndoManager
  documentName: string
  onWorkspaceLinkNavigate?: (href: string) => boolean
  isKanwasProtected: boolean
  workspaceId: string
}) {
  const { localUser, workspaceUndoController } = useWorkspace()
  const setEditor = useSetEditor()
  const removeEditor = useRemoveEditor()
  const [workspaceInterlinkMenu, setWorkspaceInterlinkMenu] = useState<WorkspaceInterlinkMenuState | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const workspaceInterlinkMenuCloseTimeoutRef = useRef<number | null>(null)

  const workspaceInterlinkSuggestions = useWorkspaceInterlinks()

  const editor = useCreateBlockNote({
    trailingBlock: false,
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
    // Custom paste handler for HTML and markdown detection
    pasteHandler: createPasteHandler(),
    // Fix double hardBreaks in pasted plain text + persist selection on blur
    _tiptapOptions: {
      // Cast needed due to TipTap version mismatch between BlockNote's bundled version and ours
      extensions: [PersistSelectionExtension as never],
      editorProps: {
        handlePaste: (view, event, slice) => handlePasteWithHardBreakDedupe(view, event, slice),
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
        handleClick: (_view, _pos, event) => {
          const targetElement = getElementFromEventTarget(event.target)
          if (!targetElement) {
            return false
          }

          // Preserve standard browser open-in-new-tab/window behaviors.
          if (event.defaultPrevented || event.button !== 0) {
            return false
          }
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return false
          }

          if (!onWorkspaceLinkNavigate) {
            return false
          }

          const anchor = targetElement.closest('a[href]')
          if (!anchor) {
            return false
          }

          const href = anchor.getAttribute('href')
          if (!href) {
            return false
          }

          const handled = onWorkspaceLinkNavigate(href)
          if (handled) {
            event.preventDefault()
            return true
          }

          return false
        },
      },
    },
  })

  useBlockNoteCollaborationUserInfo(editor, localUser)
  useBlockNoteAuditEffects({ editor, nodeId: id, isKanwasProtected })
  useCanvasCursorSuppressionWhileEditorFocused(editor)
  useBlockNoteTextSelectionSync({ editor, nodeId: id, documentName })

  const getWorkspaceInterlinkNodeInfoAtPosition = useCallback(
    (position: number): WorkspaceInterlinkNodeInfo | null => {
      const doc = editor._tiptapEditor.state.doc
      const docSize = doc.content.size
      if (!Number.isInteger(position) || position < 0 || position > docSize) {
        return null
      }

      let from = position
      let node = doc.nodeAt(from)

      if ((!node || node.type.name !== WORKSPACE_INTERLINK_TYPE) && from > 0) {
        const previousNode = doc.nodeAt(from - 1)
        if (previousNode?.type.name === WORKSPACE_INTERLINK_TYPE) {
          from -= 1
          node = previousNode
        }
      }

      if (!node || node.type.name !== WORKSPACE_INTERLINK_TYPE) {
        return null
      }

      const attrs = node.attrs as Partial<WorkspaceInterlinkProps>
      const canonicalPath = typeof attrs.canonicalPath === 'string' ? attrs.canonicalPath : ''
      const label = getWorkspaceInterlinkLabel(typeof attrs.label === 'string' ? attrs.label : '', canonicalPath)
      const href = workspaceInterlinkHrefFromProps({
        href: typeof attrs.href === 'string' ? attrs.href : '',
        canonicalPath,
        label,
        v: typeof attrs.v === 'string' ? attrs.v : WORKSPACE_INTERLINK_VERSION,
      })

      if (!href) {
        return null
      }

      return {
        from,
        to: from + node.nodeSize,
        href,
        canonicalPath,
        label,
      }
    },
    [editor]
  )

  const getWorkspaceInterlinkNodeInfoNearPositions = useCallback(
    (positions: number[]): WorkspaceInterlinkNodeInfo | null => {
      const visited = new Set<number>()

      for (const position of positions) {
        for (const candidate of [position, position - 1, position + 1]) {
          if (!Number.isInteger(candidate) || candidate < 0 || visited.has(candidate)) {
            continue
          }

          visited.add(candidate)
          const nodeInfo = getWorkspaceInterlinkNodeInfoAtPosition(candidate)
          if (nodeInfo) {
            return nodeInfo
          }
        }
      }

      return null
    },
    [getWorkspaceInterlinkNodeInfoAtPosition]
  )

  const clearWorkspaceInterlinkMenuCloseTimeout = useCallback(() => {
    if (workspaceInterlinkMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(workspaceInterlinkMenuCloseTimeoutRef.current)
      workspaceInterlinkMenuCloseTimeoutRef.current = null
    }
  }, [])

  const handleCloseWorkspaceInterlinkMenu = useCallback(() => {
    clearWorkspaceInterlinkMenuCloseTimeout()
    setWorkspaceInterlinkMenu(null)
  }, [clearWorkspaceInterlinkMenuCloseTimeout])

  const scheduleWorkspaceInterlinkMenuClose = useCallback(() => {
    clearWorkspaceInterlinkMenuCloseTimeout()
    workspaceInterlinkMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setWorkspaceInterlinkMenu(null)
      workspaceInterlinkMenuCloseTimeoutRef.current = null
    }, WORKSPACE_INTERLINK_MENU_CLOSE_DELAY_MS)
  }, [clearWorkspaceInterlinkMenuCloseTimeout])

  const openWorkspaceInterlinkMenuFromElement = useCallback(
    (interlinkElement: Element, point?: { x: number; y: number }) => {
      const domInfo = readWorkspaceInterlinkDomInfo(interlinkElement)
      if (!domInfo) {
        return
      }

      const view = editor._tiptapEditor.view
      const candidatePositions: number[] = []

      if (point) {
        const fromCoords = view.posAtCoords({ left: point.x, top: point.y })
        if (fromCoords && Number.isInteger(fromCoords.pos)) {
          candidatePositions.push(fromCoords.pos)
        }
      }

      try {
        candidatePositions.push(view.posAtDOM(domInfo.element, 0))
      } catch {
        // Ignore DOM->position failures for inline node wrappers.
      }

      if (domInfo.element !== interlinkElement) {
        try {
          candidatePositions.push(view.posAtDOM(interlinkElement, 0))
        } catch {
          // Ignore DOM->position failures for inline node wrappers.
        }
      }

      const nodeInfo = getWorkspaceInterlinkNodeInfoNearPositions(candidatePositions)
      const nextMenuState: WorkspaceInterlinkMenuState = {
        from: nodeInfo?.from ?? null,
        to: nodeInfo?.to ?? null,
        href: nodeInfo?.href ?? domInfo.href,
        canonicalPath: nodeInfo?.canonicalPath ?? domInfo.canonicalPath,
        label: nodeInfo?.label ?? domInfo.label,
        referenceElement: domInfo.element,
      }

      setWorkspaceInterlinkMenu((current) => {
        if (
          current &&
          current.href === nextMenuState.href &&
          current.canonicalPath === nextMenuState.canonicalPath &&
          current.label === nextMenuState.label &&
          current.from === nextMenuState.from &&
          current.to === nextMenuState.to &&
          current.referenceElement === nextMenuState.referenceElement
        ) {
          return current
        }

        return nextMenuState
      })
    },
    [editor, getWorkspaceInterlinkNodeInfoNearPositions]
  )

  const getValidatedWorkspaceInterlinkMenuTarget = useCallback((): WorkspaceInterlinkNodeInfo | null => {
    if (!workspaceInterlinkMenu) {
      return null
    }

    const candidatePositions: number[] = []
    if (workspaceInterlinkMenu.from !== null) {
      candidatePositions.push(workspaceInterlinkMenu.from)
    }

    const view = editor._tiptapEditor.view
    const referenceElement = workspaceInterlinkMenu.referenceElement

    if (referenceElement.isConnected) {
      const rect = referenceElement.getBoundingClientRect()
      const fromCoords = view.posAtCoords({
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
      })
      if (fromCoords && Number.isInteger(fromCoords.pos)) {
        candidatePositions.push(fromCoords.pos)
      }

      try {
        candidatePositions.push(view.posAtDOM(referenceElement, 0))
      } catch {
        // Ignore DOM->position failures for inline node wrappers.
      }
    }

    const target = getWorkspaceInterlinkNodeInfoNearPositions(candidatePositions)
    if (!target) {
      showToast('Interlink changed. Hover it again to retry.', 'info')
      setWorkspaceInterlinkMenu(null)
      return null
    }

    if (target.href !== workspaceInterlinkMenu.href || target.canonicalPath !== workspaceInterlinkMenu.canonicalPath) {
      showToast('Interlink target changed. Hover it again to retry.', 'info')
      setWorkspaceInterlinkMenu(null)
      return null
    }

    return target
  }, [workspaceInterlinkMenu, editor, getWorkspaceInterlinkNodeInfoNearPositions])

  const insertWorkspaceInterlink = useCallback(
    (suggestion: WorkspaceInterlinkSuggestion) => {
      const props = createWorkspaceInterlinkProps(suggestion.href, suggestion.title)
      if (!props) {
        return
      }

      editor.insertInlineContent([
        {
          type: WORKSPACE_INTERLINK_TYPE,
          props,
        },
        ' ',
      ])
    },
    [editor]
  )

  const getWorkspaceInterlinkItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const filtered = filterWorkspaceInterlinkSuggestions(workspaceInterlinkSuggestions, query)
      return toSuggestionMenuItems(filtered.slice(0, 80), insertWorkspaceInterlink)
    },
    [workspaceInterlinkSuggestions, insertWorkspaceInterlink]
  )

  const { slashMenuItem: slackSlashMenuItem, modal: slackModal } = useSlackMessageEmbed(editor, workspaceId)

  const getSlashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const allItems = [...getDefaultReactSlashMenuItems(editor as never), slackSlashMenuItem]
      if (!query) return allItems
      const q = query.toLowerCase()
      return allItems.filter(
        (item) => item.title.toLowerCase().includes(q) || item.aliases?.some((a) => a.toLowerCase().includes(q))
      )
    },
    [editor, slackSlashMenuItem]
  )

  const removeWorkspaceInterlink = useCallback(() => {
    const target = getValidatedWorkspaceInterlinkMenuTarget()
    if (!target) {
      return
    }

    const tiptap = editor._tiptapEditor
    tiptap.commands.focus()
    tiptap.commands.insertContentAt(
      {
        from: target.from,
        to: target.to,
      },
      target.label
    )
    handleCloseWorkspaceInterlinkMenu()
  }, [getValidatedWorkspaceInterlinkMenuTarget, editor, handleCloseWorkspaceInterlinkMenu])

  const openWorkspaceInterlinkTarget = useCallback(() => {
    if (!onWorkspaceLinkNavigate || !workspaceInterlinkMenu) {
      return
    }

    onWorkspaceLinkNavigate(workspaceInterlinkMenu.href)
    handleCloseWorkspaceInterlinkMenu()
  }, [workspaceInterlinkMenu, onWorkspaceLinkNavigate, handleCloseWorkspaceInterlinkMenu])

  // Register editor for programmatic access (focus, etc.)
  useEffect(() => {
    setEditor(id, editor as never)
    return () => {
      removeEditor(id)
    }
  }, [editor, id, setEditor, removeEditor])

  useEffect(() => {
    return () => {
      clearWorkspaceInterlinkMenuCloseTimeout()
    }
  }, [clearWorkspaceInterlinkMenuCloseTimeout])

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) {
      return
    }

    const handleClickCapture = (event: MouseEvent) => {
      const interlinkElement = findWorkspaceInterlinkElement(event.target)
      if (!interlinkElement) {
        return
      }

      if (event.button !== 0) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      if (!onWorkspaceLinkNavigate) {
        return
      }

      const domInfo = readWorkspaceInterlinkDomInfo(interlinkElement)
      if (!domInfo) {
        return
      }

      const handled = onWorkspaceLinkNavigate(domInfo.href)
      if (!handled) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleCloseWorkspaceInterlinkMenu()
    }

    const handleMouseOver = (event: MouseEvent) => {
      const interlinkElement = findWorkspaceInterlinkElement(event.target)
      if (!interlinkElement) {
        return
      }

      clearWorkspaceInterlinkMenuCloseTimeout()
      openWorkspaceInterlinkMenuFromElement(interlinkElement, {
        x: event.clientX,
        y: event.clientY,
      })
    }

    const handleMouseOut = (event: MouseEvent) => {
      const interlinkElement = findWorkspaceInterlinkElement(event.target)
      if (!interlinkElement) {
        return
      }

      const relatedElement = getElementFromEventTarget(event.relatedTarget)
      if (relatedElement) {
        if (relatedElement.closest('[data-workspace-interlink-menu]')) {
          return
        }

        if (findWorkspaceInterlinkElement(relatedElement)) {
          return
        }
      }

      scheduleWorkspaceInterlinkMenuClose()
    }

    container.addEventListener('click', handleClickCapture, true)
    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('click', handleClickCapture, true)
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
    }
  }, [
    onWorkspaceLinkNavigate,
    handleCloseWorkspaceInterlinkMenu,
    openWorkspaceInterlinkMenuFromElement,
    clearWorkspaceInterlinkMenuCloseTimeout,
    scheduleWorkspaceInterlinkMenuClose,
  ])

  useEffect(() => {
    if (!workspaceInterlinkMenu) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      if (target.closest('[data-workspace-interlink-menu]')) {
        return
      }

      handleCloseWorkspaceInterlinkMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseWorkspaceInterlinkMenu()
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [workspaceInterlinkMenu, handleCloseWorkspaceInterlinkMenu])

  useEffect(() => {
    if (!workspaceInterlinkMenu) {
      return
    }

    const tiptap = editor._tiptapEditor
    const handleTransaction = ({ transaction }: { transaction: { docChanged?: boolean } }) => {
      if (transaction.docChanged) {
        handleCloseWorkspaceInterlinkMenu()
      }
    }

    tiptap.on('transaction', handleTransaction as never)

    return () => {
      tiptap.off('transaction', handleTransaction as never)
    }
  }, [workspaceInterlinkMenu, editor, handleCloseWorkspaceInterlinkMenu])

  return (
    <div ref={editorContainerRef} className="nodrag relative">
      <BlockNoteView style={{ minHeight: '60px' }} editor={editor as never} theme={theme} formattingToolbar={false}>
        <SuggestionMenuController triggerCharacter="@" getItems={getWorkspaceInterlinkItems} />
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
        <BlockNoteFormattingToolbar editor={editor} documentName={documentName} />
      </BlockNoteView>

      {slackModal}

      {workspaceInterlinkMenu && (
        <GenericPopover
          reference={{
            element: workspaceInterlinkMenu.referenceElement,
            getBoundingClientRect: () => {
              const rect = workspaceInterlinkMenu.referenceElement.getBoundingClientRect()
              return new DOMRect(
                rect.left,
                rect.top - WORKSPACE_INTERLINK_MENU_VERTICAL_OFFSET_PX,
                rect.width,
                rect.height
              )
            },
          }}
          useFloatingOptions={{
            open: true,
            onOpenChange: (open) => {
              if (!open) {
                handleCloseWorkspaceInterlinkMenu()
              }
            },
            placement: 'top',
          }}
          elementProps={{
            style: {
              zIndex: 140,
            },
          }}
        >
          <div
            data-workspace-interlink-menu
            className="workspace-interlink-toolbar"
            onMouseEnter={clearWorkspaceInterlinkMenuCloseTimeout}
            onMouseLeave={scheduleWorkspaceInterlinkMenuClose}
          >
            <button type="button" className="workspace-interlink-toolbar-button" onClick={openWorkspaceInterlinkTarget}>
              <i
                className="fa-solid fa-arrow-up-right-from-square workspace-interlink-toolbar-icon"
                aria-hidden="true"
              />
              Open
            </button>
            <button
              type="button"
              className="workspace-interlink-toolbar-button workspace-interlink-toolbar-remove"
              onClick={removeWorkspaceInterlink}
            >
              <i className="fa-solid fa-link-slash workspace-interlink-toolbar-icon" aria-hidden="true" />
              Remove
            </button>
          </div>
        </GenericPopover>
      )}
    </div>
  )
}

function BlockNoteNodeComponent({ selected, id, data }: BlockNoteNodeProps) {
  const documentName = data.documentName || 'Untitled'
  const isStatic = data.static || false
  const { onCollapseNode, onFocusNode, onWorkspaceLinkNavigate } = data
  const isKanwasProtected = data.isKanwasProtected === true
  const { theme } = useTheme()
  const { workspaceId } = useWorkspace()
  const updateNodeInternals = useUpdateNodeInternals()
  const focusMode = useIsFocusModeActive()
  const { detachedPreview: realtimeWrite, hasActiveOperation: hasRealtimeWrite } = useRealtimeMarkdownNodeActivity(id)
  const { isVisible: isPulseVisible, isActive: isPulseActive } = useActivityPulsePresence(hasRealtimeWrite)
  const { fragment, editorKey, collaborationProvider, undoManager } = useNoteBlockNoteBinding(id, {
    awarenessEnabled: !focusMode && !realtimeWrite,
  })
  const hadDetachedPreviewRef = useRef(Boolean(realtimeWrite))
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.bn-editor')) {
      onFocusNode?.(id)
    }
  }

  useEffect(() => {
    const rootElement = rootRef.current
    const cardElement = cardRef.current
    if (!rootElement && !cardElement) {
      return
    }

    const readElementMetrics = (element: HTMLDivElement | null) => {
      if (!element) {
        return null
      }

      return {
        offsetHeight: element.offsetHeight,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        rectHeight: element.getBoundingClientRect().height,
      }
    }

    const logCurrentSize = (reason: string, changedTargets?: string[]) => {
      logMeasurement('blocknote-dom', id, {
        reason,
        changedTargets: changedTargets ?? null,
        realtimeWrite: Boolean(realtimeWrite),
        root: readElementMetrics(rootElement),
        card: readElementMetrics(cardElement),
      })
    }

    logCurrentSize('effect-start')

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const changedTargets = entries.map((entry) => {
        if (entry.target === rootElement) {
          return 'root'
        }
        if (entry.target === cardElement) {
          return 'card'
        }

        return 'unknown'
      })

      logCurrentSize('resize-observer', changedTargets)
    })

    if (rootElement) {
      resizeObserver.observe(rootElement)
    }
    if (cardElement && cardElement !== rootElement) {
      resizeObserver.observe(cardElement)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [id, realtimeWrite])

  useEffect(() => {
    if (realtimeWrite) {
      hadDetachedPreviewRef.current = true
      return
    }

    if (!hadDetachedPreviewRef.current) {
      return
    }

    hadDetachedPreviewRef.current = false

    let frame1: number | null = null
    let frame2: number | null = null

    logMeasurement('updateNodeInternals-scheduled', id, {
      realtimeWrite: Boolean(realtimeWrite),
      rootHeight: rootRef.current?.offsetHeight ?? null,
      cardHeight: cardRef.current?.offsetHeight ?? null,
    })

    frame1 = window.requestAnimationFrame(() => {
      frame1 = null
      frame2 = window.requestAnimationFrame(() => {
        frame2 = null
        logMeasurement('updateNodeInternals-fired', id, {
          realtimeWrite: Boolean(realtimeWrite),
          rootHeight: rootRef.current?.offsetHeight ?? null,
          cardHeight: cardRef.current?.offsetHeight ?? null,
        })
        updateNodeInternals(id)
      })
    })

    return () => {
      if (frame1 !== null) {
        window.cancelAnimationFrame(frame1)
      }
      if (frame2 !== null) {
        window.cancelAnimationFrame(frame2)
      }
    }
  }, [id, realtimeWrite, updateNodeInternals])

  const nodeCardContent = (
    <div style={{ padding: NODE_LAYOUT.PADDING }}>
      {realtimeWrite ? (
        <DetachedMarkdownBlockNote markdown={realtimeWrite.visibleMarkdown} />
      ) : fragment ? (
        <BlockNoteEditorErrorBoundary fragmentKey={editorKey}>
          <BlockNoteEditor
            key={editorKey}
            fragment={fragment}
            provider={collaborationProvider}
            theme={theme.mode}
            id={id}
            undoManager={undoManager}
            documentName={documentName}
            onWorkspaceLinkNavigate={onWorkspaceLinkNavigate}
            isKanwasProtected={isKanwasProtected}
            workspaceId={workspaceId}
          />
        </BlockNoteEditorErrorBoundary>
      ) : null}
    </div>
  )

  return (
    <div ref={rootRef} className="group/expanded">
      <DocumentName
        nodeId={id}
        documentName={documentName}
        isStatic={isStatic}
        onToggleCollapse={() => onCollapseNode?.(id)}
        containerStyle={{ width: NODE_LAYOUT.WIDTH, maxWidth: NODE_LAYOUT.WIDTH }}
        trailingContent={
          <div className="mr-5">
            <DocumentShareControl workspaceId={workspaceId} noteId={id} documentName={documentName} />
          </div>
        }
      />
      <div
        ref={cardRef}
        className={`bg-white dark:bg-editor border box-border relative node-card-blocknote ${selected && !isPulseVisible ? 'node-card-selected' : ''}`}
        style={{
          width: `${NODE_LAYOUT.WIDTH}px`,
          minHeight: `${NODE_LAYOUT.MIN_HEIGHT}px`,
          borderRadius: '20px',
        }}
        onDoubleClick={handleDoubleClick}
      >
        {isPulseVisible ? <NodeActivityPulse active={isPulseActive} /> : null}
        {nodeCardContent}
      </div>
    </div>
  )
}

export default memo(BlockNoteNodeComponent)
