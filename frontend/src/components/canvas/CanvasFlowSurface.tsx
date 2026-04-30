import {
  ReactFlow as XYReactFlow,
  SelectionMode,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CANVAS } from './constants'
import { SnapGuides } from './SnapGuides'
import { canvasNodeTypes, defaultCanvasViewport } from './CanvasFlow.config'

interface CanvasFlowSurfaceProps {
  themeMode: 'light' | 'dark'
  focusMode: boolean
  nodes: object[]
  edges: Edge[]
  swapIndicator: Parameters<typeof SnapGuides>[0]['swapIndicator']
  canvasSurfaceRef: React.RefObject<HTMLDivElement | null>
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onSelectionChange: ({ nodes }: { nodes: Node[] }) => void
  onPaneClick: () => void
  onPaneContextMenu: (event: React.MouseEvent | MouseEvent) => void
  onNodeClick: NodeMouseHandler<Node>
  onNodeContextMenu: NodeMouseHandler<Node>
  onNodeDragStart: Parameters<typeof XYReactFlow>[0]['onNodeDragStart']
  onNodeDrag: Parameters<typeof XYReactFlow>[0]['onNodeDrag']
  onNodeDragStop: Parameters<typeof XYReactFlow>[0]['onNodeDragStop']
  onInit: (instance: { setViewport: (viewport: { x: number; y: number; zoom: number }) => void }) => void
  onViewportChange: (viewport: { x: number; y: number; zoom: number }) => void
}

export function CanvasFlowSurface({
  themeMode,
  focusMode,
  nodes,
  edges,
  swapIndicator,
  canvasSurfaceRef,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  onPaneClick,
  onPaneContextMenu,
  onNodeClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  onInit,
  onViewportChange,
}: CanvasFlowSurfaceProps) {
  return (
    <div ref={canvasSurfaceRef} className={`w-full h-full relative ${focusMode ? 'canvas-hidden-for-focus' : ''}`}>
      <XYReactFlow
        colorMode={themeMode}
        nodes={nodes as never}
        edges={edges as never}
        nodeTypes={canvasNodeTypes as never}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        defaultViewport={defaultCanvasViewport}
        onInit={onInit}
        onViewportChange={onViewportChange}
        panOnScrollSpeed={1.25}
        panOnScroll={!focusMode}
        panOnDrag={focusMode ? false : [1, 2]}
        minZoom={CANVAS.MIN_ZOOM}
        maxZoom={CANVAS.MAX_ZOOM}
        zoomOnPinch={true}
        zoomOnScroll={!focusMode}
        zoomOnDoubleClick={!focusMode}
        nodeDragThreshold={6}
        nodeClickDistance={4}
        paneClickDistance={4}
        selectionOnDrag={true}
        selectNodesOnDrag={false}
        selectionMode={SelectionMode.Partial}
        elevateNodesOnSelect={true}
      >
        <SnapGuides swapIndicator={swapIndicator} />
      </XYReactFlow>
    </div>
  )
}
