import { useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Tree, TreeApi, CursorProps, NodeRendererProps } from 'react-arborist'
import type { CanvasItem } from 'shared'
import { TreeNode } from './TreeNode'
import { toCanvasTreeData, SPACER_ID, type TreeNode as TreeNodeType } from './tree-utils'
import {
  TreeStateContext,
  DropTargetContext,
  SelectionContext,
  type SelectionStore,
  type DropTargetStore,
} from './tree-contexts'
import { useWorkspace } from '@/providers/workspace/WorkspaceContext'
import { useContainerHeight, useDropTargetHighlight, useCanvasTreeMove, useDisableDrop } from './hooks'

// Larger value = easier to reorder as siblings (vs dropping into).
// Too small causes accidental "drop into" when trying to reorder.
const DROP_ZONE_INDENT = 20
const ROW_HEIGHT = 34
const PADDING_TOP = 4
const PADDING_BOTTOM = 4

interface CanvasTreeProps {
  root: CanvasItem
  activeCanvasId: string | null
  onCanvasSelect: (id: string) => void
}

export interface CanvasTreeHandle {
  openAll: () => void
  closeAll: () => void
}

export const CanvasTree = forwardRef<CanvasTreeHandle, CanvasTreeProps>(function CanvasTree(
  { root, activeCanvasId, onCanvasSelect },
  ref
) {
  const { store, yDoc } = useWorkspace()
  const treeRef = useRef<TreeApi<TreeNodeType>>(null)
  const { containerRef, containerHeight } = useContainerHeight()

  const activeCanvasIdRef = useRef<string | null>(activeCanvasId)
  activeCanvasIdRef.current = activeCanvasId
  const selectedNodeIdsRef = useRef<string[] | undefined>(undefined)

  const treeStateValue = useMemo(() => ({ activeCanvasIdRef, selectedNodeIdsRef }), [])

  // Drop target subscription store
  const dropListenersRef = useRef<Set<() => void>>(new Set())

  const notifyDropSubscribers = useCallback(() => {
    dropListenersRef.current.forEach((callback) => callback())
  }, [])

  const { dropTargetParentIdRef, updateDropTarget, clearDropTarget } = useDropTargetHighlight({
    onNotify: notifyDropSubscribers,
  })

  // Selection store (always empty for canvas tree)
  const selectionStore = useRef<SelectionStore>({
    getSnapshot: () => undefined,
    subscribe: () => () => {},
  })

  const dropTargetStore = useRef<DropTargetStore>({
    getSnapshot: () => dropTargetParentIdRef.current,
    subscribe: (callback) => {
      dropListenersRef.current.add(callback)
      return () => dropListenersRef.current.delete(callback)
    },
  }).current

  const handleMoveInternal = useCanvasTreeMove({ root: store.root, yDoc })
  const disableDrop = useDisableDrop({ onDropTargetChange: updateDropTarget })

  // Stable ref for onMove - prevents react-arborist drag state from breaking
  // when the callback identity changes due to dependency updates
  const handleMoveRef = useRef(handleMoveInternal)
  handleMoveRef.current = handleMoveInternal

  const handleMove = useCallback(
    (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      handleMoveRef.current(args)
      clearDropTarget()
    },
    [clearDropTarget]
  )

  const data = useMemo(() => {
    const canvasData = toCanvasTreeData(root)
    canvasData.push({
      id: SPACER_ID,
      name: '',
      _kind: 'spacer',
      _canvasId: 'root',
      _original: null,
    })
    return canvasData
  }, [root])

  const renderCursor = useCallback(
    ({ top }: CursorProps) => {
      const visibleCount = treeRef.current?.visibleNodes?.length ?? data.length
      const spacerTop = PADDING_TOP + (visibleCount - 1) * ROW_HEIGHT
      if (top > spacerTop) return null
      return <div className="absolute h-0.5 bg-[#FFB300] pointer-events-none z-50" style={{ top, left: 6, right: 4 }} />
    },
    [data.length]
  )

  // Auto-expand to show active canvas
  useEffect(() => {
    if (activeCanvasId && treeRef.current) {
      treeRef.current.openParents(activeCanvasId)
    }
  }, [activeCanvasId])

  const renderNode = useCallback(
    (props: NodeRendererProps<TreeNodeType>) => (
      <TreeNode {...props} onCanvasSelect={onCanvasSelect} onNodeSelect={() => {}} />
    ),
    [onCanvasSelect]
  )

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const isNodeClick = target.closest('[data-tree-node]')
      if (!isNodeClick) {
        onCanvasSelect('root')
      }
    },
    [onCanvasSelect]
  )

  useImperativeHandle(ref, () => ({
    openAll: () => treeRef.current?.openAll(),
    closeAll: () => treeRef.current?.closeAll(),
  }))

  return (
    <TreeStateContext.Provider value={treeStateValue}>
      <DropTargetContext.Provider value={dropTargetStore}>
        <SelectionContext.Provider value={selectionStore.current}>
          <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden" onClick={handleContainerClick}>
            {containerHeight > 0 && (
              <Tree
                ref={treeRef}
                data={data}
                onMove={handleMove}
                disableDrop={disableDrop}
                renderCursor={renderCursor}
                indent={DROP_ZONE_INDENT}
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
            )}
          </div>
        </SelectionContext.Provider>
      </DropTargetContext.Provider>
    </TreeStateContext.Provider>
  )
})
