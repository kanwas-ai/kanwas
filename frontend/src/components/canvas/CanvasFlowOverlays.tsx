import type { NodeChange } from '@xyflow/react'
import { DeleteConfirmation } from '@/components/ui/DeleteConfirmation'
import { CanvasContextMenu } from './CanvasContextMenu'
import { FocusModeOverlay } from './FocusModeOverlay'

interface ContextMenuState {
  x: number
  y: number
  mode: 'pane' | 'selection'
}

interface CanvasFlowOverlaysProps {
  canvasId: string
  focusMode: boolean
  focusModeNodeId: string | null
  focusedNodeType: 'blockNote' | null
  isSwitchingDocument: boolean
  pendingDeleteChanges: NodeChange[] | null
  contextMenu: ContextMenuState | null
  contextMenuAddControls: React.ReactNode
  createGroup: () => void
  createSection: () => void
  canGroupSelection: boolean
  onExitFocusMode: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onCloseContextMenu: () => void
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }
  addNode: (options: { canvasId?: string; position?: { x: number; y: number } }) => string | null
  addStickyNote: (options: { canvasId?: string; position?: { x: number; y: number } }) => string | null
  addTextNode: (options: { canvasId?: string; position?: { x: number; y: number } }) => string | null
  onAddLink: () => void
  onAddImage: () => void
  onAddFile: () => void
}

export function CanvasFlowOverlays({
  canvasId,
  focusMode,
  focusModeNodeId,
  focusedNodeType,
  isSwitchingDocument,
  pendingDeleteChanges,
  contextMenu,
  contextMenuAddControls,
  createGroup,
  createSection,
  canGroupSelection,
  onExitFocusMode,
  onConfirmDelete,
  onCancelDelete,
  onCloseContextMenu,
  screenToFlowPosition,
  addNode,
  addStickyNote,
  addTextNode,
  onAddLink,
  onAddImage,
  onAddFile,
}: CanvasFlowOverlaysProps) {
  return (
    <>
      {contextMenuAddControls}
      {focusMode && focusModeNodeId && focusedNodeType && (
        <FocusModeOverlay
          key={focusModeNodeId}
          nodeId={focusModeNodeId}
          nodeType={focusedNodeType}
          onExit={onExitFocusMode}
          skipEnterAnimation={isSwitchingDocument}
        />
      )}
      {pendingDeleteChanges && <DeleteConfirmation onDelete={onConfirmDelete} onCancel={onCancelDelete} />}
      {contextMenu && (
        <CanvasContextMenu
          position={contextMenu}
          mode={contextMenu.mode}
          onAddDocument={() => {
            addNode({ canvasId, position: screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y }) })
          }}
          onAddStickyNote={() => {
            addStickyNote({ canvasId, position: screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y }) })
          }}
          onAddTextNode={() => {
            addTextNode({ canvasId, position: screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y }) })
          }}
          onAddLink={onAddLink}
          onAddImage={onAddImage}
          onAddFile={onAddFile}
          onGroup={createGroup}
          onCreateSection={createSection}
          canGroupSelection={canGroupSelection}
          onClose={onCloseContextMenu}
        />
      )}
    </>
  )
}
