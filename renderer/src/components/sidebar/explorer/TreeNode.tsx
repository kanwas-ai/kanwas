import { useState, useRef, useEffect } from 'react'
import type { NodeRendererProps } from 'react-arborist'
import type { CanvasItem } from 'shared'
import { InlineInput } from '@/components/ui/InlineInput'
import { DeleteConfirmation } from '@/components/ui/DeleteConfirmation'
import { useRenameTreeItem, useDeleteTreeItem, useUpdateDocumentName, useDeleteNode } from '@/components/canvas/hooks'
import { type TreeNode as TreeNodeType, SPACER_ID, DOCUMENT_SPACER_ID } from './tree-utils'
import { useDropTargetParentId, useTreeState, useSelectedNodeIds } from './tree-contexts'
import { canvasContainsNodeId, findCanonicalKanwasNodeId, isReservedTopLevelCanvasName } from '@/lib/workspaceUtils'
import { getCanvasItemDisplayName } from '@/lib/workspaceItemNames'
import { showToast } from '@/utils/toast'
import { useWorkspace } from '@/providers/workspace'
import { getCanvasIconClassName } from './sidebar-icons'

interface TreeNodeProps extends NodeRendererProps<TreeNodeType> {
  onCanvasSelect: (id: string) => void
  onNodeSelect: (nodeId: string, canvasId: string) => void
  onNodeFocus?: (nodeId: string, canvasId: string) => void
}

export function TreeNode({ node, style, dragHandle, onCanvasSelect, onNodeSelect, onNodeFocus }: TreeNodeProps) {
  // Get active canvas from context ref (stable, for callbacks)
  const { activeCanvasIdRef } = useTreeState()
  const activeCanvasId = activeCanvasIdRef.current

  // Subscribe to selection changes - re-renders when selection changes
  const selectedNodeIds = useSelectedNodeIds()

  // Subscribe to drop target via context - only re-renders when highlight state changes
  const dropTargetParentId = useDropTargetParentId()
  const [isRenaming, setIsRenaming] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const renameTreeItem = useRenameTreeItem()
  const deleteTreeItem = useDeleteTreeItem()
  const updateDocumentName = useUpdateDocumentName()
  const deleteNode = useDeleteNode()
  const { store } = useWorkspace()

  // Track pending click timeout - cancelled if double-click happens
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
    }
  }, [])

  // Pick a random empty message - must be before any early returns
  // const isCanvasNode = node.data._kind === 'canvas'
  // const emptyMessage = useMemo(() => {
  //   if (!isCanvasNode || !node.isOpen) return null
  //   return EMPTY_CANVAS_MESSAGES[Math.floor(Math.random() * EMPTY_CANVAS_MESSAGES.length)]
  // }, [isCanvasNode, node.isOpen])

  // Spacer is an invisible drop zone at the bottom - clicking selects root
  // Looks like empty space but receives drop events
  if (node.data._kind === 'spacer' || node.id === SPACER_ID || node.id === DOCUMENT_SPACER_ID) {
    return <div ref={dragHandle} style={style} className="cursor-pointer" onClick={() => onCanvasSelect('root')} />
  }

  const isCanvas = node.data._kind === 'canvas'
  const isActive = node.id === activeCanvasId
  const isSelected = !isCanvas && selectedNodeIds?.includes(node.id)
  const isDropTarget = isCanvas && node.id === dropTargetParentId
  const hasChildren = isCanvas && node.children && node.children.length > 0
  const original = node.data._original!
  const canonicalKanwasNodeId = store.root ? findCanonicalKanwasNodeId(store.root) : null
  const isKanwasProtectedNode =
    !isCanvas && original.kind === 'node' && canonicalKanwasNodeId !== null && original.id === canonicalKanwasNodeId
  const isKanwasProtectedCanvas =
    isCanvas &&
    original.kind === 'canvas' &&
    canonicalKanwasNodeId !== null &&
    canvasContainsNodeId(original, canonicalKanwasNodeId)
  const isDeleteProtected = isKanwasProtectedNode || isKanwasProtectedCanvas
  const documentIconClassName = isKanwasProtectedNode ? 'fa-solid fa-gear' : 'fa-solid fa-file'

  // Check if inside drop target (for subtree highlighting)
  const isInsideDropTarget = (() => {
    if (!dropTargetParentId) return false
    let parent = node.parent
    while (parent) {
      if (parent.id === dropTargetParentId) return true
      parent = parent.parent
    }
    return false
  })()

  const displayName = getCanvasItemDisplayName(original)
  const isTopLevelCanvas = !node.parent || node.parent.id === '__REACT_ARBORIST_INTERNAL_ROOT__'
  const isReservedTopLevelCanvas = isCanvas && isTopLevelCanvas && isReservedTopLevelCanvasName(original.name)
  const canvasIconClassName = getCanvasIconClassName(displayName, isCanvas && isTopLevelCanvas)

  const nodeCount = isCanvas ? (original as CanvasItem).items?.length : 0

  const handleClick = (e: React.MouseEvent) => {
    if (isRenaming) return
    if (isCanvas) {
      onCanvasSelect(node.id)
      // Detect icon click by x-coordinate
      const rect = e.currentTarget.getBoundingClientRect()
      const paddingLeft = parseFloat((e.currentTarget as HTMLElement).style.paddingLeft || '0')
      const relativeX = e.clientX - rect.left
      const isIconClick = relativeX >= paddingLeft + 10 && relativeX <= paddingLeft + 34
      if (isIconClick) {
        node.toggle()
      } else if (hasChildren && !node.isOpen) {
        node.open()
      }
    } else {
      // Delay node selection to distinguish from double-click
      // This prevents "move then zoom" when double-clicking
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null
        onNodeSelect(node.id, node.data._canvasId)
      }, 100)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Cancel pending single-click action
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    if (isCanvas) {
      if (isReservedTopLevelCanvas) {
        return
      }
      setIsRenaming(true)
    } else {
      onNodeFocus?.(node.id, node.data._canvasId)
    }
  }

  const handleRename = (newName: string) => {
    if (isReservedTopLevelCanvas) {
      setIsRenaming(false)
      return
    }

    if (newName.trim() && newName !== original.name) {
      if (isCanvas) {
        renameTreeItem(node.id, newName)
      } else {
        updateDocumentName(node.id, newName)
      }
    }
    setIsRenaming(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isKanwasProtectedNode) {
      showToast('Instructions document cannot be deleted', 'info')
      return
    }

    if (isKanwasProtectedCanvas) {
      showToast('Cannot delete a canvas that contains the instructions document', 'info')
      return
    }

    if (isReservedTopLevelCanvas) {
      showToast('This folder cannot be deleted', 'info')
      return
    }

    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    if (isCanvas) {
      deleteTreeItem(node.id)
    } else {
      deleteNode(node.id, node.data._canvasId)
    }
    setShowDeleteConfirm(false)
  }

  // const handleChevronClick = (e: React.MouseEvent) => {
  //   e.stopPropagation()
  //   node.toggle()
  // }

  // Drop target highlighting
  const bgClass =
    node.willReceiveDrop || isDropTarget
      ? 'bg-[var(--palette-amber-bright)]/20 ring-1 ring-inset ring-[var(--palette-amber-bright)]'
      : isInsideDropTarget
        ? 'bg-[var(--palette-amber-bright)]/10'
        : ''

  // Show empty message inline with the folder when empty
  // const showEmptyInline = isCanvas && node.isOpen && !hasChildren

  return (
    <>
      <div
        ref={isReservedTopLevelCanvas ? undefined : dragHandle}
        style={style}
        className={`
          group
          ${bgClass}
          ${bgClass ? 'hover:bg-[var(--palette-amber-bright)]/30' : ''}
          outline-none select-none cursor-pointer
        `}
        data-tree-node
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Content layer with pointer-events-none so drag handle receives mousedown directly */}
        <div
          className={`
            ${!bgClass && (isActive || isSelected) ? 'bg-sidebar-selection' : ''}
            ${!bgClass && !isActive && !isSelected ? 'group-hover:bg-sidebar-hover' : ''}
            mx-1 rounded-[var(--chat-radius)]
            relative flex items-center font-medium h-[32px] px-3 pointer-events-none
            ${node.isDragging ? 'opacity-50' : ''}
          `}
        >
          {isCanvas ? (
            <span className="relative shrink-0 w-[11px] h-[11px] flex items-center justify-center">
              {/* Folder icon - hide on hover if has children */}
              <i
                className={`${canvasIconClassName} icon-gradient absolute opacity-70 ${hasChildren ? 'group-hover:opacity-0' : ''}`}
                style={{ 'fontSize': '11px', '--icon-color': 'var(--sidebar-icon)' } as React.CSSProperties}
              />
              {/* Chevron icon - show on hover if has children */}
              {hasChildren && (
                <i
                  className={`fa-solid ${node.isOpen ? 'fa-chevron-down' : 'fa-chevron-right'} absolute opacity-0 group-hover:opacity-100 ${isActive || isSelected ? 'text-sidebar-item-text' : 'text-sidebar-icon'}`}
                  style={{ fontSize: '9px' }}
                />
              )}
            </span>
          ) : (
            <i
              className={`${documentIconClassName} icon-gradient shrink-0`}
              style={
                {
                  'fontSize': '11px',
                  '--icon-color': isActive || isSelected ? 'var(--sidebar-item-text)' : 'var(--sidebar-icon)',
                } as React.CSSProperties
              }
            />
          )}

          <div
            className={`flex items-center gap-1.5 flex-1 min-w-0 ml-1.5 ${isActive || isSelected ? 'text-sidebar-item-text-active' : 'text-sidebar-item-text'}`}
          >
            {isRenaming ? (
              <div
                className="flex-1 min-w-0 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
              >
                <InlineInput
                  value={original.name}
                  onSave={handleRename}
                  onCancel={() => setIsRenaming(false)}
                  placeholder={isCanvas ? 'Canvas name...' : 'Document name...'}
                />
              </div>
            ) : (
              <>
                <span className="text-sm truncate flex-1 min-w-0" title={displayName} data-tree-label>
                  {displayName}
                  {isKanwasProtectedNode && <span className="text-[color:var(--sidebar-icon)]"> (instructions)</span>}
                </span>
                {/* {showEmptyInline && (
                  <span className="text-xs text-foreground-muted italic whitespace-nowrap">{emptyMessage}</span>
                )} */}
              </>
            )}
          </div>

          {isCanvas && nodeCount > 0 && (
            <span className="text-[11px] text-sidebar-icon shrink-0 w-5 text-center group-hover:invisible">
              {nodeCount}
            </span>
          )}

          {!isDeleteProtected && !isReservedTopLevelCanvas && (
            <button
              onClick={handleDelete}
              className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center pointer-events-auto cursor-pointer"
              title="Delete"
            >
              <i className="fa-solid fa-trash text-[11px] text-sidebar-icon hover:text-foreground transition-colors" />
            </button>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmation onDelete={confirmDelete} onCancel={() => setShowDeleteConfirm(false)} />
      )}
    </>
  )
}
