import { type NodeMouseHandler, type Node as XYNode, useReactFlow } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useSnapshot } from 'valtio/react'
import type { CanvasItem, NodeItem } from 'shared'
import { summarizeNode } from '@/api/nodes'
import { useTheme } from '@/providers/theme'
import { useWorkspace, useWorkspaceUndoController } from '@/providers/workspace'
import { useFocusMode } from '@/store/useUIStore'
import { getPlainTextFromNodeContent } from '@/lib/blockNotePlainText'
import { findCanonicalKanwasNodeId } from '@/lib/workspaceUtils'
import { showToast } from '@/utils/toast'
import {
  useCreateGroup,
  useGroupDrag,
  useGroupLookups,
  useGroupMutations,
  collapseNode,
  COLLAPSIBLE_TYPES,
} from './group'
import { useFitNodeInView, useFocusNodeAt100 } from './hooks'
import { useNavigateNodes } from './useNavigateNodes'
import { useCanvasLayout } from './useCanvasLayout'
import { COLLAPSED_NODE_LAYOUT } from 'shared/constants'
import { compactAfterCollapse, toRect } from './canvasLayout'
import { useCanvasContextMenuAddActions } from './useCanvasContextMenuAddActions'
import { useCanvasViewportState } from './useCanvasViewportState'
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts'
import { useCanvasImportInteractions } from './useCanvasImportInteractions'
import { useCanvasSelection } from './useCanvasSelection'
import { useCanvasDeletion } from './useCanvasDeletion'
import { useCanvasNodeProjection } from './useCanvasNodeProjection'
import { useCanvasExternalFocus } from './useCanvasExternalFocus'
import { useCanvasChangeHandlers } from './useCanvasChangeHandlers'
import { usePendingCanvasPlacementRepair } from './usePendingCanvasPlacementRepair'
import { CanvasFlowSurface } from './CanvasFlowSurface'
import { CanvasFlowControls } from './CanvasFlowControls'
import { CanvasFlowOverlays } from './CanvasFlowOverlays'
import { useInitialCanvasFitRequest } from './useInitialCanvasFitRequest'
import { useCreateSection, useSectionCollisionResolution, useSectionDrag, useSectionMutations } from './section'

interface CanvasFlowProps {
  mutableCanvas: CanvasItem
  selectedNodeIds: string[]
  selectedNodeId?: string | null
  focusedNodeId?: string | null
  fitSelectedNode?: boolean
  fitCanvasRequestKey?: string | null
  onNodeFocused?: () => void
  onSelectionChange?: (nodeIds: string[]) => void
  onCanvasSelect?: (canvasId: string) => void
  onWorkspaceLinkNavigate?: (href: string) => boolean
  onFitCanvasRequestHandled?: (requestKey: string) => void
}

export function CanvasFlow({
  mutableCanvas,
  selectedNodeIds,
  selectedNodeId,
  focusedNodeId,
  fitSelectedNode = true,
  fitCanvasRequestKey,
  onNodeFocused,
  onSelectionChange,
  onCanvasSelect,
  onWorkspaceLinkNavigate,
  onFitCanvasRequestHandled,
}: CanvasFlowProps) {
  const canvas = useSnapshot(mutableCanvas) as CanvasItem
  const { themeMode } = useTheme()
  const workspaceUndoController = useWorkspaceUndoController()
  const {
    workspaceId,
    store,
    yDoc,
    contentStore,
    provider,
    localUser,
    isCursorPresenceSuppressed,
    acquireCursorPresenceSuppression,
  } = useWorkspace()
  const fitNodeInView = useFitNodeInView()
  const focusNodeAt100 = useFocusNodeAt100()
  const setSelectedNodeIds = useCallback(
    (nodeIds: string[]) => {
      onSelectionChange?.(nodeIds)
    },
    [onSelectionChange]
  )
  const { navigateNodes } = useNavigateNodes(canvas, selectedNodeIds, setSelectedNodeIds)
  const { screenToFlowPosition, flowToScreenPosition, zoomTo, setViewport, getViewport, getNode } = useReactFlow()
  const {
    focusMode,
    focusedNodeId: focusModeNodeId,
    focusedNodeType,
    savedViewport,
    isSwitchingDocument,
    enterFocusMode,
  } = useFocusMode()
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const canvasSurfaceRef = useRef<HTMLDivElement>(null)
  const [toolbarHoverSectionId, setToolbarHoverSectionId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; mode: 'pane' | 'selection' } | null>(null)
  const [activeSectionDragId, setActiveSectionDragId] = useState<string | null>(null)

  const { groupedIds, groupedIdsRef, nodeToGroupRef, groupGrids } = useGroupLookups(canvas.groups)
  const { handleGroupColorChange, handleGroupColumnsChange, handleGroupDrag, handleGroupNameChange } =
    useGroupMutations(mutableCanvas)
  const { activateSectionCollisionResolution } = useSectionCollisionResolution({
    canvas,
    mutableCanvas,
    isSectionDragging: activeSectionDragId !== null,
  })
  const {
    handleSectionTitleChange,
    handleSectionLayoutChange,
    handleSectionColumnsChange,
    handleSectionDrag,
    handleDeleteSection,
  } = useSectionMutations(mutableCanvas, activateSectionCollisionResolution)
  const sectionNodeIds = useMemo(
    () => new Set((canvas.sections ?? []).flatMap((section) => section.memberIds)),
    [canvas.sections]
  )
  const {
    swapIndicator,
    clearSwapIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    handleNodesChangeForLayout,
    prepareNodeExpand,
  } = useCanvasLayout({ mutableCanvas, groupedIds, excludeIds: sectionNodeIds })

  const summaryRequestsInFlightRef = useRef(new Set<string>())
  const requestNodeSummary = useCallback(
    (node: NodeItem) => {
      if (node.summary || summaryRequestsInFlightRef.current.has(node.id)) {
        return
      }

      node.summary = undefined
      const content = getPlainTextFromNodeContent(node, contentStore)
      if (!content) {
        node.summary = ''
        return
      }

      summaryRequestsInFlightRef.current.add(node.id)
      void summarizeNode(workspaceId, node.id, {
        name: node.name,
        content,
        emoji: node.emoji ?? null,
        summary: null,
      })
        .then(({ title, emoji, summary }) => {
          const target = mutableCanvas.items.find((item) => item.id === node.id)
          if (!target || target.kind !== 'node') {
            return
          }

          if (emoji) target.emoji = emoji
          target.summary = summary || ''
          if (title && title !== target.name) target.name = title
        })
        .catch(() => {
          const target = mutableCanvas.items.find((item) => item.id === node.id)
          if (target && target.kind === 'node') {
            target.summary = ''
          }
          showToast('Failed to summarize document', 'error')
        })
        .finally(() => {
          summaryRequestsInFlightRef.current.delete(node.id)
        })
    },
    [contentStore, mutableCanvas, workspaceId]
  )

  const {
    draggingNodeIdsRef,
    joinTargetGroupId,
    isMultiDragActive,
    setIsMultiDragActive,
    onNodeDragStart: onNodeDragStartWithGroups,
    onNodeDrag: onNodeDragWithGroups,
    onNodeDragStop: onNodeDragStopWithGroups,
  } = useGroupDrag({
    mutableCanvas,
    canvasGroups: canvas.groups,
    groupedIdsRef,
    nodeToGroupRef,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    prepareNodeExpand,
    clearSwapIndicator,
    requestNodeSummary,
  })
  const {
    joinTargetSectionId,
    onNodeDragStart: onNodeDragStartWithSections,
    onNodeDrag: onNodeDragWithSections,
    onNodeDragStop: onNodeDragStopWithSections,
  } = useSectionDrag({
    mutableCanvas,
    groupedIdsRef,
    draggingNodeIdsRef,
    onSectionContentChange: activateSectionCollisionResolution,
    onNodeDragStart: onNodeDragStartWithGroups,
    onNodeDrag: onNodeDragWithGroups,
    onNodeDragStop: onNodeDragStopWithGroups,
  })

  usePendingCanvasPlacementRepair({ canvas, mutableCanvas, workspaceUndoController })

  const handleSectionDragStart = useCallback((sectionId: string) => {
    setActiveSectionDragId(sectionId)
  }, [])

  const handleSectionDragEnd = useCallback((sectionId: string) => {
    setActiveSectionDragId((currentSectionId) => (currentSectionId === sectionId ? null : currentSectionId))
  }, [])

  const importInteractions = useCanvasImportInteractions({
    canvasId: canvas.id,
    screenToFlowPosition,
    canvasContainerRef,
  })

  const { handleViewportChange, handleFocusModeExit, handleInit } = useCanvasViewportState({
    workspaceId,
    canvasId: canvas.id,
    selectedNodeId,
    focusedNodeId,
    deferDefaultViewportRestore: Boolean(fitCanvasRequestKey),
    focusMode,
    savedViewport,
    provider,
    localUserId: localUser.id,
    isCursorPresenceSuppressed,
    acquireCursorPresenceSuppression,
    screenToFlowPosition,
    flowToScreenPosition,
    setViewport,
    canvasSurfaceRef,
  })

  const { pendingDeleteChanges, queueDeleteConfirmation, confirmDelete, cancelDelete } = useCanvasDeletion({
    mutableCanvas,
    root: store.root,
    yDoc,
    workspaceUndoController,
  })

  const { deselectNode, selectOnlyNode, handleSelectionChange, handlePaneClick, handleNodeClick } = useCanvasSelection({
    selectedNodeIds,
    setSelectedNodeIds,
    setIsMultiDragActive,
    clearContextMenu: () => setContextMenu(null),
  })

  const canonicalKanwasNodeId = store.root ? findCanonicalKanwasNodeId(store.root) : null

  const selectedTextNodes = useMemo(
    () =>
      mutableCanvas.items.filter(
        (item): item is NodeItem =>
          item.kind === 'node' && selectedNodeIds.includes(item.id) && COLLAPSIBLE_TYPES.has(item.xynode.type)
      ),
    [mutableCanvas.items, selectedNodeIds]
  )

  const isCollapseButtonActive = selectedTextNodes.length > 0
  const collapseAction = selectedTextNodes.some((item) => item.collapsed !== true) ? 'collapse' : 'expand'
  const isFocusModeAvailable = useMemo(() => {
    if (focusMode) {
      return true
    }

    if (selectedNodeIds.length !== 1) {
      return false
    }

    const item = canvas.items.find((candidate) => candidate.id === selectedNodeIds[0])
    return item?.kind === 'node' && item.xynode.type === 'blockNote'
  }, [canvas.items, focusMode, selectedNodeIds])

  const createGroup = useCreateGroup({ mutableCanvas, selectedNodeIds, requestNodeSummary })
  const createSection = useCreateSection({ mutableCanvas, selectedNodeIds, groupedIds })
  const canGroupSelection = selectedTextNodes.length >= 2
  const canCreateSectionSelection = useMemo(
    () =>
      mutableCanvas.items.filter(
        (item): item is NodeItem =>
          item.kind === 'node' && selectedNodeIds.includes(item.id) && !groupedIds.has(item.id)
      ).length >= 2,
    [groupedIds, mutableCanvas.items, selectedNodeIds]
  )

  const handleExpandNode = useCallback(
    (nodeId: string) => {
      const item = mutableCanvas.items.find((candidate) => candidate.id === nodeId)
      if (item && item.kind === 'node') {
        prepareNodeExpand(nodeId)
        item.collapsed = false
      }
    },
    [mutableCanvas, prepareNodeExpand]
  )

  const compactBelow = useCallback(
    (collapsedIds: string[]) => {
      const rects = mutableCanvas.items
        .filter((item): item is NodeItem => item.kind === 'node' || item.kind === 'canvas')
        .map((item) => {
          const rect = toRect(item)
          if (!rect) {
            return null
          }

          if (collapsedIds.includes(item.id)) {
            rect.width = COLLAPSED_NODE_LAYOUT.WIDTH
            rect.height = COLLAPSED_NODE_LAYOUT.HEIGHT
          }
          return rect
        })
        .filter((rect): rect is NonNullable<typeof rect> => rect !== null)

      const allUpdates = new Map<string, { x: number; y: number }>()
      for (const id of collapsedIds) {
        const updates = compactAfterCollapse(
          rects.map((rect) => (allUpdates.has(rect.id) ? { ...rect, y: allUpdates.get(rect.id)!.y } : rect)),
          id
        )
        for (const update of updates) {
          allUpdates.set(update.id, { x: update.x, y: update.y })
        }
      }

      for (const [id, position] of allUpdates) {
        const item = mutableCanvas.items.find((candidate) => candidate.id === id)
        if (item) {
          item.xynode.position = { x: position.x, y: position.y }
        }
      }
    },
    [mutableCanvas]
  )

  const handleCollapseNode = useCallback(
    (nodeId: string) => {
      const item = mutableCanvas.items.find((candidate) => candidate.id === nodeId)
      if (item && item.kind === 'node') {
        collapseNode(item)
        requestNodeSummary(item)
        compactBelow([nodeId])
      }
    },
    [mutableCanvas, compactBelow, requestNodeSummary]
  )

  const handleToggleSelectedNodes = useCallback(() => {
    if (selectedTextNodes.length === 0) {
      return
    }

    if (collapseAction === 'collapse') {
      const collapsedIds: string[] = []
      for (const item of selectedTextNodes) {
        if (item.collapsed !== true) {
          collapseNode(item)
          requestNodeSummary(item)
          collapsedIds.push(item.id)
        }
      }

      if (collapsedIds.length > 0) {
        compactBelow(collapsedIds)
      }
      return
    }

    for (const item of selectedTextNodes) {
      if (item.collapsed === true) {
        prepareNodeExpand(item.id)
        item.collapsed = false
      }
    }
  }, [selectedTextNodes, collapseAction, compactBelow, prepareNodeExpand, requestNodeSummary])

  const handleToggleFocusMode = useCallback(() => {
    if (focusMode) {
      handleFocusModeExit()
      return
    }

    if (selectedNodeIds.length !== 1) {
      return
    }

    const nodeId = selectedNodeIds[0]
    const item = canvas.items.find((candidate) => candidate.id === nodeId)
    if (!item || item.kind !== 'node' || item.xynode.type !== 'blockNote') {
      return
    }

    enterFocusMode(nodeId, item.xynode.type, getViewport())
  }, [canvas.items, enterFocusMode, focusMode, getViewport, handleFocusModeExit, selectedNodeIds])

  useCanvasKeyboardShortcuts({
    undo: () => workspaceUndoController.undo(),
    redo: () => workspaceUndoController.redo(),
    navigateNodes,
    zoomTo,
  })

  const nodes = useCanvasNodeProjection({
    canvas,
    groupedIds,
    groupGrids,
    draggingNodeIdsRef,
    joinTargetGroupId,
    joinTargetSectionId,
    toolbarHoverSectionId,
    onCanvasSelect,
    onFocusNode: focusNodeAt100,
    onSelectNode: selectOnlyNode,
    onDeselectNode: deselectNode,
    onWorkspaceLinkNavigate,
    onExpandNode: handleExpandNode,
    onCollapseNode: handleCollapseNode,
    handleGroupColorChange,
    handleGroupColumnsChange,
    handleGroupDrag,
    handleGroupNameChange,
    handleSectionTitleChange,
    handleSectionLayoutChange,
    handleSectionColumnsChange,
    handleSectionDrag,
    handleSectionDragStart,
    handleSectionDragEnd,
    handleDeleteSection,
    canonicalKanwasNodeId,
    selectedNodeIds,
  })
  const renderedNodeIds = useMemo(() => nodes.map((node) => node.id), [nodes])

  useInitialCanvasFitRequest({
    workspaceId,
    canvasId: canvas.id,
    canvasItems: canvas.items,
    renderedNodeIds,
    fitCanvasRequestKey,
    getNode,
    setViewport,
    onFitCanvasRequestHandled,
  })

  const edges = useMemo(() => canvas.edges.map((edge) => ({ ...edge, selected: false })), [canvas.edges])

  useCanvasExternalFocus({
    canvas,
    workspaceId,
    selectedNodeId,
    focusedNodeId,
    fitSelectedNode,
    suppressSelectedNodeFallbackFit: Boolean(fitCanvasRequestKey),
    focusMode,
    focusModeNodeId,
    savedViewport,
    enterFocusMode,
    getViewport,
    setViewport,
    fitNodeInView,
    focusNodeAt100,
    setSelectedNodeIds,
    onNodeFocused,
  })

  const { onNodesChange, onEdgesChange } = useCanvasChangeHandlers({
    mutableCanvas,
    root: store.root,
    handleNodesChangeForLayout,
    queueDeleteConfirmation,
    onSectionContentChange: activateSectionCollisionResolution,
  })

  const onNodeContextMenu = useCallback<NodeMouseHandler<XYNode>>(
    (event, node) => {
      if (!canGroupSelection || !selectedNodeIds.includes(node.id)) {
        if (!canCreateSectionSelection || !selectedNodeIds.includes(node.id)) {
          return
        }
      }

      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY, mode: 'selection' })
    },
    [canCreateSectionSelection, canGroupSelection, selectedNodeIds]
  )

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, mode: 'pane' })
  }, [])

  const {
    controls: contextMenuAddControls,
    handleAddLink: handleContextMenuAddLink,
    handleAddImage: handleContextMenuAddImage,
    handleAddFile: handleContextMenuAddFile,
  } = useCanvasContextMenuAddActions({
    canvasId: canvas.id,
    contextMenu,
    screenToFlowPosition,
    addLinkNode: importInteractions.addLinkNode,
    addImageNode: importInteractions.addImageNode,
    addFileNode: importInteractions.addFileNode,
  })

  return (
    <>
      <div
        ref={canvasContainerRef}
        className={`w-full h-full relative bg-canvas overflow-hidden ${
          importInteractions.isDraggingOver ? 'ring-4 ring-inset ring-primary-button-background/50' : ''
        } ${isMultiDragActive ? 'canvas-multi-dragging' : ''}`}
        onDragEnter={importInteractions.handleDragEnter}
        onDragLeave={importInteractions.handleDragLeave}
        onDragOver={importInteractions.handleDragOver}
        onFocusCapture={importInteractions.handleCanvasFocusCapture}
        onBlurCapture={importInteractions.handleCanvasBlurCapture}
        onMouseEnter={importInteractions.handleCanvasMouseEnter}
        onMouseLeave={importInteractions.handleCanvasMouseLeave}
        onMouseDownCapture={importInteractions.handleCanvasMouseDownCapture}
        onMouseMove={importInteractions.handleCanvasMouseMove}
        onDrop={importInteractions.handleDrop}
      >
        {importInteractions.isDraggingOver && (
          <div className="absolute inset-0 z-50 bg-primary-button-background/10 pointer-events-none flex items-center justify-center">
            <div className="bg-editor px-6 py-4 rounded-lg shadow-lg border-2 border-primary-button-outline flex items-center gap-2">
              <i className="fa-solid fa-file-arrow-down" />
              <span>Drop content to add</span>
            </div>
          </div>
        )}

        <CanvasFlowSurface
          themeMode={themeMode}
          focusMode={focusMode}
          nodes={nodes}
          edges={edges}
          swapIndicator={joinTargetGroupId ? null : swapIndicator}
          canvasSurfaceRef={canvasSurfaceRef}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={handleSelectionChange}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStartWithSections}
          onNodeDrag={onNodeDragWithSections}
          onNodeDragStop={onNodeDragStopWithSections}
          onInit={handleInit}
          onViewportChange={handleViewportChange}
        />

        <CanvasFlowControls
          mutableCanvas={mutableCanvas}
          focusMode={focusMode}
          isFocusModeAvailable={isFocusModeAvailable}
          canGroupSelection={canGroupSelection}
          isCollapseButtonActive={isCollapseButtonActive}
          collapseAction={collapseAction}
          onHoveredSectionChange={setToolbarHoverSectionId}
          onSectionContentChange={activateSectionCollisionResolution}
          onToggleFocusMode={handleToggleFocusMode}
          onCreateGroup={createGroup}
          onToggleSelectedNodes={handleToggleSelectedNodes}
        />
      </div>

      <CanvasFlowOverlays
        canvasId={canvas.id}
        focusMode={focusMode}
        focusModeNodeId={focusModeNodeId}
        focusedNodeType={focusedNodeType}
        isSwitchingDocument={isSwitchingDocument}
        pendingDeleteChanges={pendingDeleteChanges}
        contextMenu={contextMenu}
        contextMenuAddControls={contextMenuAddControls}
        createGroup={createGroup}
        createSection={createSection}
        canGroupSelection={canGroupSelection}
        onExitFocusMode={handleFocusModeExit}
        onConfirmDelete={confirmDelete}
        onCancelDelete={cancelDelete}
        onCloseContextMenu={() => setContextMenu(null)}
        screenToFlowPosition={screenToFlowPosition}
        addNode={importInteractions.addNode}
        addStickyNote={importInteractions.addStickyNote}
        addTextNode={importInteractions.addTextNode}
        onAddLink={handleContextMenuAddLink}
        onAddImage={handleContextMenuAddImage}
        onAddFile={handleContextMenuAddFile}
      />
    </>
  )
}
