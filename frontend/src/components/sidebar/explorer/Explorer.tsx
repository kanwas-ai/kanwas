import { useState, useMemo, useRef, useCallback } from 'react'
import type { CanvasItem } from 'shared'
import type { Workspace } from '@/api/client'
import { WorkspaceHeader } from '@/components/workspaces/WorkspaceHeader'
import { ConnectionsModal } from '@/components/ui/ConnectionsModal'
import { SkillsLibrary } from '@/components/skills'
import { useToolkits } from '@/hooks/useConnections'
import { useSkills } from '@/hooks/useSkillsApi'
import { useCreateCanvas, useAddNode, useFitNodeInView, useFocusNode } from '@/components/canvas/hooks'
import { findCanvasById } from '@/lib/workspaceUtils'
import { useUI, useConnectionsModal } from '@/store/useUIStore'
import { SectionHeader } from './SectionHeader'
import { CanvasTree, type CanvasTreeHandle } from './CanvasTree'
import { DocumentList } from './DocumentList'
import { ConnectionsFooter } from './ConnectionsFooter'
import { SkillsFooter } from './SkillsFooter'
import { SlackFooter } from './SlackFooter'

interface ExplorerProps {
  root: CanvasItem | null
  activeCanvasId: string | null
  onCanvasSelect: (id: string) => void
  onNodeSelect: (nodeId: string, canvasId: string) => void
  onNodeFocus?: (nodeId: string, canvasId: string) => void
  workspaceId: string
  workspaces: Workspace[]
  isLoadingWorkspaces: boolean
  selectedNodeIds?: string[]
}

export function Explorer({
  root,
  activeCanvasId,
  onCanvasSelect,
  onNodeSelect,
  onNodeFocus,
  workspaceId,
  workspaces,
  isLoadingWorkspaces,
  selectedNodeIds,
}: ExplorerProps) {
  const { connectionsModalOpen, connectionsModalInitialSearch, openConnectionsModal, closeConnectionsModal } =
    useConnectionsModal()
  const [showSkillsModal, setShowSkillsModal] = useState(false)
  const [expandedAll, setExpandedAll] = useState(false)
  const canvasTreeRef = useRef<CanvasTreeHandle>(null)

  // Split ratio from persisted UI state
  const { explorerSplitPercent, setExplorerSplitPercent } = useUI()
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const { data: connectedToolkits } = useToolkits(workspaceId, { isConnected: true })
  const { data: skills } = useSkills()
  const connectedConnections = useMemo(
    () => (connectedToolkits ?? []).filter((toolkit) => toolkit.isConnected && !toolkit.isNoAuth),
    [connectedToolkits]
  )
  const connectedCount = connectedConnections.length
  const enabledSkillsCount = skills?.filter((s) => s.enabled).length ?? 0
  const totalSkillsCount = skills?.length ?? 0

  const createCanvas = useCreateCanvas()
  const addNode = useAddNode()
  const fitNodeInView = useFitNodeInView()
  const focusNode = useFocusNode()

  const handleCreateCanvas = () => {
    const canvasId = createCanvas(activeCanvasId || 'root')
    if (!canvasId) return
    // Select the new canvas to open/expand it in the tree
    onCanvasSelect(canvasId)
    setTimeout(() => {
      fitNodeInView(canvasId)
    }, 100)
  }

  const handleCreateDocument = () => {
    const canvasId = activeCanvasId || 'root'
    const nodeId = addNode({ canvasId })
    if (!nodeId) return
    setTimeout(() => {
      fitNodeInView(nodeId)
      focusNode(nodeId)
    }, 100)
  }

  const handleToggleExpandAll = () => {
    if (expandedAll) {
      canvasTreeRef.current?.closeAll()
    } else {
      canvasTreeRef.current?.openAll()
    }
    setExpandedAll(!expandedAll)
  }

  // Find active canvas for the document list
  const activeCanvas = useMemo(() => {
    if (!root || !activeCanvasId) return null
    return findCanvasById(root, activeCanvasId)
  }, [root, activeCanvasId])

  // Draggable divider resize
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return

      isDraggingRef.current = true
      const startY = e.clientY
      const startSplit = explorerSplitPercent
      const containerRect = container.getBoundingClientRect()

      const handleMouseMove = (e: MouseEvent) => {
        const deltaY = e.clientY - startY
        const deltaPercent = (deltaY / containerRect.height) * 100
        const newSplit = Math.max(15, Math.min(85, startSplit + deltaPercent))
        setExplorerSplitPercent(newSplit)
      }

      const handleMouseUp = () => {
        isDraggingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [explorerSplitPercent, setExplorerSplitPercent]
  )

  return (
    <div className="flex flex-col h-full min-w-0">
      <WorkspaceHeader workspaceId={workspaceId} workspaces={workspaces} isLoading={isLoadingWorkspaces} />

      <div ref={containerRef} className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {root && (
          <>
            {/* Canvas section */}
            <div className="flex flex-col min-h-0" style={{ flex: explorerSplitPercent }}>
              <SectionHeader
                title="Canvases"
                actions={[
                  {
                    icon: 'fa-sharp fa-solid fa-arrows-from-line',
                    title: expandedAll ? 'Collapse All' : 'Expand All',
                    onClick: handleToggleExpandAll,
                  },
                  {
                    icon: 'fa-solid fa-plus',
                    title: 'New Canvas',
                    onClick: handleCreateCanvas,
                  },
                ]}
              />

              <div className="cursor-pointer select-none group" onClick={() => onCanvasSelect('root')}>
                <div
                  className={`flex items-center h-[32px] mx-1 px-3 gap-1.5 rounded-[var(--chat-radius)] ${activeCanvasId === 'root' ? 'bg-sidebar-selection' : 'group-hover:bg-sidebar-hover'}`}
                >
                  <i
                    className="fa-solid fa-home icon-gradient"
                    style={
                      {
                        'fontSize': '11px',
                        '--icon-color': activeCanvasId === 'root' ? 'var(--sidebar-item-text)' : 'var(--sidebar-icon)',
                      } as React.CSSProperties
                    }
                  />
                  <span
                    className={`text-sm font-medium ${activeCanvasId === 'root' ? 'text-sidebar-item-text-active' : 'text-sidebar-item-text'}`}
                  >
                    Home
                  </span>
                </div>
              </div>

              <CanvasTree
                ref={canvasTreeRef}
                root={root}
                activeCanvasId={activeCanvasId}
                onCanvasSelect={onCanvasSelect}
              />
            </div>

            {/* Resize divider */}
            <div className="shrink-0 h-px relative cursor-row-resize group" onMouseDown={handleDividerMouseDown}>
              <div className="absolute bottom-0 left-0 right-0 h-px group-hover:h-1 bg-[var(--sidebar-edge-border)] transition-all" />
            </div>

            {/* Document section */}
            <div className="flex flex-col min-h-0" style={{ flex: 100 - explorerSplitPercent }}>
              <SectionHeader title="Documents" onAdd={handleCreateDocument} addTitle="New Document" />

              {activeCanvas ? (
                <DocumentList
                  key={activeCanvasId}
                  activeCanvas={activeCanvas}
                  activeCanvasId={activeCanvasId}
                  onNodeSelect={onNodeSelect}
                  onNodeFocus={onNodeFocus}
                  selectedNodeIds={selectedNodeIds}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-foreground-muted italic px-4">
                  Select a canvas
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="shrink-0">
        <div className="h-px bg-[var(--sidebar-edge-border)]" />
        <SectionHeader title="Powertools" />
        <SkillsFooter
          enabledCount={enabledSkillsCount}
          totalCount={totalSkillsCount}
          onClick={() => setShowSkillsModal(true)}
        />

        <ConnectionsFooter connectedCount={connectedCount} onClick={() => openConnectionsModal()} />
        <SlackFooter />
      </div>

      <SkillsLibrary isOpen={showSkillsModal} onClose={() => setShowSkillsModal(false)} />

      <ConnectionsModal
        isOpen={connectionsModalOpen}
        onClose={closeConnectionsModal}
        workspaceId={workspaceId}
        initialSearch={connectionsModalInitialSearch}
      />
    </div>
  )
}
