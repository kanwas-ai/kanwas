import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  createTextSelectionStore,
  TextSelectionContext,
  useTextSelection,
  useWorkspace,
  WorkspaceContext,
  type TextSelection,
  type WorkspaceContextValue,
} from '@/providers/workspace/WorkspaceContext'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createWorkspaceContextValue(): WorkspaceContextValue {
  return {
    store: {} as WorkspaceContextValue['store'],
    yDoc: {} as WorkspaceContextValue['yDoc'],
    provider: {} as WorkspaceContextValue['provider'],
    localUser: { id: 'user-1', name: 'User', color: '#000000' },
    acquireCursorPresenceSuppression: () => () => undefined,
    isCursorPresenceSuppressed: () => false,
    contentStore: {} as WorkspaceContextValue['contentStore'],
    workspaceUndoController: {} as WorkspaceContextValue['workspaceUndoController'],
    sharedEditorUndoManager: {} as WorkspaceContextValue['sharedEditorUndoManager'],
    hasInitiallySynced: true,
    initialSyncError: null,
    isConnected: true,
    isReconnecting: false,
    disconnectReason: null,
    workspaceId: 'workspace-1',
    activeCanvasId: 'root',
    setActiveCanvasId: () => undefined,
  }
}

describe('workspace text selection store', () => {
  it('isolates text selection updates from broad workspace consumers', () => {
    const textSelectionStore = createTextSelectionStore()
    const workspaceValue = createWorkspaceContextValue()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    let workspaceRenderCount = 0
    let textSelectionRenderCount = 0
    let latestTextSelection: TextSelection | null = null

    function WorkspaceConsumer() {
      useWorkspace()
      workspaceRenderCount += 1
      return null
    }

    function TextSelectionConsumer() {
      const { textSelection } = useTextSelection()
      textSelectionRenderCount += 1
      latestTextSelection = textSelection
      return null
    }

    const selection: TextSelection = {
      nodeId: 'node-1',
      nodeName: 'Node 1',
      text: 'selected text',
      lineCount: 1,
    }

    try {
      act(() => {
        root.render(
          <WorkspaceContext.Provider value={workspaceValue}>
            <TextSelectionContext.Provider value={textSelectionStore}>
              <WorkspaceConsumer />
              <TextSelectionConsumer />
            </TextSelectionContext.Provider>
          </WorkspaceContext.Provider>
        )
      })

      expect(workspaceRenderCount).toBe(1)
      expect(textSelectionRenderCount).toBe(1)
      expect(latestTextSelection).toBeNull()

      act(() => {
        textSelectionStore.setTextSelection(selection)
      })

      expect(workspaceRenderCount).toBe(1)
      expect(textSelectionRenderCount).toBe(2)
      expect(latestTextSelection).toEqual(selection)

      act(() => {
        textSelectionStore.setTextSelection({ ...selection })
      })

      expect(workspaceRenderCount).toBe(1)
      expect(textSelectionRenderCount).toBe(2)

      act(() => {
        textSelectionStore.setTextSelection(null)
      })

      expect(workspaceRenderCount).toBe(1)
      expect(textSelectionRenderCount).toBe(3)
      expect(latestTextSelection).toBeNull()
    } finally {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })
})
