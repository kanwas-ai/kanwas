import { memo } from 'react'
import { useUI } from '@/store/useUIStore'
import { ResizeHandle } from '@/components/ui/ResizeHandle/ResizeHandle'
import { useResize } from '@/components/ui/ResizeHandle/useResize'
import { Explorer } from './explorer'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useWorkspace } from '@/providers/workspace'
import type { CanvasItem } from 'shared'

interface WorkspaceSidebarProps {
  root: CanvasItem | null
  activeCanvasId: string | null
  onCanvasSelect: (id: string) => void
  onNodeSelect: (nodeId: string, canvasId: string) => void
  onNodeFocus?: (nodeId: string, canvasId: string) => void
  selectedNodeIds?: string[]
}

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  root,
  activeCanvasId,
  onCanvasSelect,
  onNodeSelect,
  onNodeFocus,
  selectedNodeIds,
}: WorkspaceSidebarProps) {
  const { sidebarOpen, zenMode, fullScreenMode, sidebarWidth, setSidebarWidth } = useUI()
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useWorkspaces()
  const { workspaceId } = useWorkspace()

  const { isResizing, resizeRef, handleMouseDown } = useResize({
    direction: 'horizontal',
    position: 'left',
    minSize: 200,
    maxSize: (windowWidth) => windowWidth * 0.3,
    onResize: setSidebarWidth,
  })

  if (!sidebarOpen || zenMode || fullScreenMode) {
    return null
  }

  return (
    <div
      className="absolute right-0 h-full z-40 bg-sidebar-surface border-l border-[var(--sidebar-edge-border)] flex flex-col"
      style={{ width: `${sidebarWidth}px` }}
    >
      <Explorer
        root={root}
        activeCanvasId={activeCanvasId}
        onCanvasSelect={onCanvasSelect}
        onNodeSelect={onNodeSelect}
        onNodeFocus={onNodeFocus}
        workspaceId={workspaceId}
        workspaces={workspaces}
        isLoadingWorkspaces={isLoadingWorkspaces}
        selectedNodeIds={selectedNodeIds}
      />

      <ResizeHandle
        direction="horizontal"
        position="left"
        isResizing={isResizing}
        resizeRef={resizeRef}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
})
