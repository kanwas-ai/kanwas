import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Node as XYNode } from '@xyflow/react'
import { useCanvasSelection } from '@/components/canvas/useCanvasSelection'
import { NodesSelectionProvider } from '@/providers/nodes-selection'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type SelectionControls = ReturnType<typeof useCanvasSelection>

function createSelectionNode(id: string): XYNode {
  return { id } as XYNode
}

function SelectionProbe({
  selectedNodeIds,
  programmaticSelectedNodeId,
  setSelectedNodeIds,
  setIsMultiDragActive,
  clearContextMenu,
  onControls,
}: {
  selectedNodeIds: string[]
  programmaticSelectedNodeId?: string | null
  setSelectedNodeIds: (nodeIds: string[]) => void
  setIsMultiDragActive: (isActive: boolean) => void
  clearContextMenu: () => void
  onControls: (controls: SelectionControls) => void
}) {
  const controls = useCanvasSelection({
    selectedNodeIds,
    programmaticSelectedNodeId,
    setSelectedNodeIds,
    setIsMultiDragActive,
    clearContextMenu,
  })
  onControls(controls)
  return null
}

function renderSelectionProbe({
  selectedNodeIds,
  programmaticSelectedNodeId = null,
}: {
  selectedNodeIds: string[]
  programmaticSelectedNodeId?: string | null
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const setSelectedNodeIds = vi.fn()
  const setIsMultiDragActive = vi.fn()
  const clearContextMenu = vi.fn()
  let controls: SelectionControls | null = null

  act(() => {
    root.render(
      <NodesSelectionProvider>
        <SelectionProbe
          selectedNodeIds={selectedNodeIds}
          programmaticSelectedNodeId={programmaticSelectedNodeId}
          setSelectedNodeIds={setSelectedNodeIds}
          setIsMultiDragActive={setIsMultiDragActive}
          clearContextMenu={clearContextMenu}
          onControls={(nextControls) => {
            controls = nextControls
          }}
        />
      </NodesSelectionProvider>
    )
  })

  if (!controls) {
    throw new Error('selection controls were not initialized')
  }

  return {
    controls,
    setSelectedNodeIds,
    setIsMultiDragActive,
    clearContextMenu,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('canvas selection', () => {
  it('ignores React Flow empty-selection echoes for the current programmatic selected node', () => {
    const probe = renderSelectionProbe({
      selectedNodeIds: ['node-1'],
      programmaticSelectedNodeId: 'node-1',
    })

    try {
      act(() => {
        probe.controls.handleSelectionChange({ nodes: [] })
      })

      expect(probe.setSelectedNodeIds).not.toHaveBeenCalled()
    } finally {
      probe.cleanup()
    }
  })

  it('ignores React Flow selection events that match current local selection', () => {
    const probe = renderSelectionProbe({
      selectedNodeIds: ['node-1'],
    })

    try {
      act(() => {
        probe.controls.handleSelectionChange({ nodes: [createSelectionNode('node-1')] })
      })

      expect(probe.setSelectedNodeIds).not.toHaveBeenCalled()
    } finally {
      probe.cleanup()
    }
  })

  it('propagates empty selection when there is no current programmatic selected node', () => {
    const probe = renderSelectionProbe({
      selectedNodeIds: ['node-1'],
    })

    try {
      act(() => {
        probe.controls.handleSelectionChange({ nodes: [] })
      })

      expect(probe.setSelectedNodeIds).toHaveBeenCalledWith([])
    } finally {
      probe.cleanup()
    }
  })

  it('propagates selection of a different node after a programmatic selection', () => {
    const probe = renderSelectionProbe({
      selectedNodeIds: ['node-1'],
      programmaticSelectedNodeId: 'node-1',
    })

    try {
      act(() => {
        probe.controls.handleSelectionChange({ nodes: [createSelectionNode('node-2')] })
      })

      expect(probe.setSelectedNodeIds).toHaveBeenCalledWith(['node-2'])
    } finally {
      probe.cleanup()
    }
  })

  it('keeps explicit pane clicks able to clear a programmatic selection', () => {
    const probe = renderSelectionProbe({
      selectedNodeIds: ['node-1'],
      programmaticSelectedNodeId: 'node-1',
    })

    try {
      act(() => {
        probe.controls.handlePaneClick()
      })

      expect(probe.setIsMultiDragActive).toHaveBeenCalledWith(false)
      expect(probe.clearContextMenu).toHaveBeenCalled()
      expect(probe.setSelectedNodeIds).toHaveBeenCalledWith([])
    } finally {
      probe.cleanup()
    }
  })
})
