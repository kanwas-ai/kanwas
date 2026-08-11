import { useCallback, useRef, useEffect, useMemo } from 'react'
import { Tree, TreeApi, CursorProps, NodeRendererProps } from 'react-arborist'
import type { CanvasItem } from 'shared'
import { TreeNode } from './TreeNode'
import { toDocumentListData, type TreeNode as TreeNodeType } from './tree-utils'
import {
  TreeStateContext,
  DropTargetContext,
  SelectionContext,
  type SelectionStore,
  type DropTargetStore,
} from './tree-contexts'
import { useWorkspace } from '@/providers/workspace/WorkspaceContext'
import { useContainerHeight, useDropTargetHighlight, useDocumentListMove, useDocumentDisableDrop } from './hooks'

const ROW_HEIGHT = 34
const PADDING_TOP = 4
const PADDING_BOTTOM = 16

interface DocumentListProps {
  activeCanvas: CanvasItem
  activeCanvasId: string | null
  onNodeSelect: (nodeId: string, canvasId: string) => void
  onNodeFocus?: (nodeId: string, canvasId: string) => void
  selectedNodeIds?: string[]
}

export function DocumentList({
  activeCanvas,
  activeCanvasId,
  onNodeSelect,
  onNodeFocus,
  selectedNodeIds,
}: DocumentListProps) {
  const { store, yDoc } = useWorkspace()
  const treeRef = useRef<TreeApi<TreeNodeType>>(null)

  const { containerRef, containerHeight } = useContainerHeight()

  const activeCanvasIdRef = useRef<string | null>(activeCanvasId)
  activeCanvasIdRef.current = activeCanvasId
  const selectedNodeIdsRef = useRef<string[] | undefined>(selectedNodeIds)
  selectedNodeIdsRef.current = selectedNodeIds

  const treeStateValue = useMemo(() => ({ activeCanvasIdRef, selectedNodeIdsRef }), [])

  // Drop target subscription store
  const dropListenersRef = useRef<Set<() => void>>(new Set())

  const notifyDropSubscribers = useCallback(() => {
    dropListenersRef.current.forEach((callback) => callback())
  }, [])

  const { dropTargetParentIdRef, updateDropTarget, clearDropTarget } = useDropTargetHighlight({
    onNotify: notifyDropSubscribers,
  })

  // Selection subscription store
  const selectionListenersRef = useRef<Set<() => void>>(new Set())

  const notifySelectionSubscribers = useCallback(() => {
    selectionListenersRef.current.forEach((callback) => callback())
  }, [])

  const selectionStore = useRef<SelectionStore>({
    getSnapshot: () => selectedNodeIdsRef.current,
    subscribe: (callback) => {
      selectionListenersRef.current.add(callback)
      return () => selectionListenersRef.current.delete(callback)
    },
  })

  // Notify subscribers when selection changes
  useEffect(() => {
    notifySelectionSubscribers()
  }, [selectedNodeIds, notifySelectionSubscribers])

  const dropTargetStore = useRef<DropTargetStore>({
    getSnapshot: () => dropTargetParentIdRef.current,
    subscribe: (callback) => {
      dropListenersRef.current.add(callback)
      return () => dropListenersRef.current.delete(callback)
    },
  }).current

  const handleMoveInternal = useDocumentListMove({ activeCanvasId, root: store.root, yDoc })
  const disableDrop = useDocumentDisableDrop({ onDropTargetChange: updateDropTarget })

  const handleMove = useCallback(
    (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      handleMoveInternal(args)
      clearDropTarget()
    },
    [handleMoveInternal, clearDropTarget]
  )

  const data = useMemo(() => toDocumentListData(activeCanvas), [activeCanvas])

  const renderCursor = useCallback(
    ({ top }: CursorProps) => {
      const visibleCount = treeRef.current?.visibleNodes?.length ?? data.length
      const spacerTop = PADDING_TOP + (visibleCount - 1) * ROW_HEIGHT
      if (top > spacerTop) return null
      return <div className="absolute h-0.5 bg-[#FFB300] pointer-events-none z-50" style={{ top, left: 6, right: 4 }} />
    },
    [data.length]
  )

  const renderNode = useCallback(
    (props: NodeRendererProps<TreeNodeType>) => (
      <TreeNode {...props} onCanvasSelect={() => {}} onNodeSelect={onNodeSelect} onNodeFocus={onNodeFocus} />
    ),
    [onNodeSelect, onNodeFocus]
  )

  // Has documents if more than just the spacer
  const hasDocuments = data.length > 1

  return (
    <TreeStateContext.Provider value={treeStateValue}>
      <DropTargetContext.Provider value={dropTargetStore}>
        <SelectionContext.Provider value={selectionStore.current}>
          <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
            {!hasDocuments ? (
              <div className="flex items-center justify-center h-full text-xs text-foreground-muted italic px-4">
                No documents yet
              </div>
            ) : containerHeight > 0 ? (
              <Tree
                ref={treeRef}
                data={data}
                onMove={handleMove}
                disableDrop={disableDrop}
                renderCursor={renderCursor}
                indent={0}
                rowHeight={ROW_HEIGHT}
                overscanCount={20}
                disableMultiSelection
                openByDefault={false}
                width="100%"
                height={containerHeight}
                paddingTop={PADDING_TOP}
                paddingBottom={PADDING_BOTTOM}
              >
                {renderNode}
              </Tree>
            ) : null}
          </div>
        </SelectionContext.Provider>
      </DropTargetContext.Provider>
    </TreeStateContext.Provider>
  )
}
