import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkspaceProvider, useTextSelectionStore, useWorkspace } from '@/providers/workspace'
import { CanvasFlow } from '@/components/canvas/CanvasFlow'
import { ChatProvider } from '@/providers/chat'
import { Chat } from '@/components/chat/Chat'
import { ProjectStateProvider } from '@/providers/project-state'
import { NodesSelectionProvider } from '@/providers/nodes-selection'
import { useUI, exitFocusMode } from '@/store/useUIStore'
import ThemeToggle from '@/components/ui/ThemeToggle'
import ZoomResetButton from '@/components/ui/ZoomResetButton'
import HelpButton from '@/components/ui/HelpButton'
import { findCanvasById, resolveWorkspaceLink } from '@/lib/workspaceUtils'
import type { CanvasItem } from 'shared'
import { WorkspaceSidebar } from '@/components/sidebar/WorkspaceSidebar'
import { SearchModal } from '@/components/search/SearchModal'
import { SearchHighlighter } from '@/components/search/SearchHighlighter'
import { useKeyboardShortcut } from '@/providers/keyboard'
import { KanwasEditorManager } from '@/components/kanwas/KanwasEditorManager'
import { RealtimeMarkdownWriteController } from '@/components/note-editors/RealtimeMarkdownWriteController'
import { getLastSelectedNode, setLastSelectedNode, setLastActiveCanvas } from '@/hooks/workspaceStorage'
import type { SearchResult } from '@/hooks/useWorkspaceSearch'
import { showToast } from '@/utils/toast'
import { WorkspaceInterlinksProvider } from '@/providers/workspace-interlinks'
import { buildWorkspaceInterlinkSuggestions } from '@/lib/workspaceInterlinks'
import { describeConnectionLoss } from '@/lib/liveConnection'
import { useWorkspaceStructure } from '@/hooks/useWorkspaceStructure'
import thinkingAnimation from '@/assets/thinking-animation.png'
import {
  type CanvasFitRequest,
  getInitialFitOverlayStyle,
  getFollowRequestAfterHandledFit,
  getWorkspaceRouteForCanvas,
  normalizeRouteCanvasPath,
  type PendingFollowAfterFit,
  resolveCanvasFromRoute,
  shouldShowActiveCanvasInitialFitOverlay,
  shouldKeepProgrammaticNodeTarget,
} from './workspacePageState'
import type { Workspace } from '@/api/client'
import { getAgentCanvasFollowRequestKey, type AgentCanvasFollowRequest } from '@/components/chat/agentFileFollow'
import { useAddBlockNoteNodeFromImport } from '@/components/canvas/hooks'
import { readGBrainPage } from '@/api/gbrain'

const RECONNECTING_INDICATOR_DELAY_MS = 20_000

function areStringArraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function areFollowRequestsEqual(left: AgentCanvasFollowRequest | null, right: AgentCanvasFollowRequest | null) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return getAgentCanvasFollowRequestKey(left) === getAgentCanvasFollowRequestKey(right)
}

function WorkspaceContent({ routeCanvasPath, workspace }: { routeCanvasPath: string; workspace?: Workspace }) {
  const {
    store,
    yDoc,
    contentStore,
    hasInitiallySynced,
    initialSyncError,
    isConnected,
    isReconnecting,
    disconnectReason,
    workspaceId,
    activeCanvasId,
    setActiveCanvasId,
  } = useWorkspace()
  const textSelectionStore = useTextSelectionStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { structureFingerprint, sidebarRoot } = useWorkspaceStructure(store)
  const addBlockNoteNodeFromImport = useAddBlockNoteNodeFromImport()

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [followRequest, setFollowRequest] = useState<AgentCanvasFollowRequest | null>(null)
  const [fitSelectedNode, setFitSelectedNode] = useState(true)
  const selectedNodeIdRef = useRef<string | null>(null)
  selectedNodeIdRef.current = selectedNodeId
  const focusedNodeIdRef = useRef<string | null>(null)
  focusedNodeIdRef.current = focusedNodeId
  const followRequestRef = useRef<AgentCanvasFollowRequest | null>(null)
  followRequestRef.current = followRequest
  const selectedNodeIdsRef = useRef<string[]>([])
  selectedNodeIdsRef.current = selectedNodeIds
  // Canvas transition state for fade effect
  const [canvasOpacity, setCanvasOpacity] = useState(1)
  const [showReconnectIndicator, setShowReconnectIndicator] = useState(false)
  const prevCanvasIdRef = useRef<string | null>(null)
  const disconnectDetail = describeConnectionLoss(disconnectReason)

  // Keep activeCanvasId in ref for stable callbacks (prevents react-arborist drag breakage)
  const activeCanvasIdRef = useRef<string | null>(activeCanvasId)
  activeCanvasIdRef.current = activeCanvasId
  const { zenMode, fullScreenMode, sidebarOpen, sidebarWidth, toggleSidebar, disableFullScreenMode } = useUI()
  // rootRef holds the live proxy — always has current data
  const rootRef = useRef<CanvasItem | null>(store.root as CanvasItem | null)
  rootRef.current = store.root as CanvasItem | null

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [pendingHighlight, setPendingHighlight] = useState<{ nodeId: string; query: string } | null>(null)
  const [pendingCanvasAction, setPendingCanvasAction] = useState<{
    canvasId: string
    nodeId?: string
    focus?: boolean
  } | null>(null)
  const fitCanvasRequestSequenceRef = useRef(0)
  const [fitCanvasRequest, setFitCanvasRequest] = useState<CanvasFitRequest | null>(null)
  const fitCanvasRequestRef = useRef<CanvasFitRequest | null>(null)
  fitCanvasRequestRef.current = fitCanvasRequest
  const pendingFollowAfterFitRef = useRef<PendingFollowAfterFit<AgentCanvasFollowRequest> | null>(null)
  const lastHandledCanvasIdRef = useRef<string | null>(null)

  const normalizedRouteCanvasPath = useMemo(() => normalizeRouteCanvasPath(routeCanvasPath), [routeCanvasPath])
  const resolvedRouteCanvasId = useMemo(() => {
    if (!hasInitiallySynced || !store.root) {
      return null
    }

    if (normalizedRouteCanvasPath.length === 0) {
      return 'root'
    }

    return resolveCanvasFromRoute(store.root, normalizedRouteCanvasPath)
  }, [hasInitiallySynced, normalizedRouteCanvasPath, store.root])

  // Keyboard shortcuts to open search
  useKeyboardShortcut(' ', () => setIsSearchOpen(true), { ctrl: true, skipInputs: false, preventDefault: true })
  useKeyboardShortcut('s', () => setIsSearchOpen(true))

  const getCanvasRoute = useCallback(
    (canvasId: string) => {
      return getWorkspaceRouteForCanvas(workspaceId, rootRef.current, canvasId)
    },
    [workspaceId]
  )

  const navigateToCanvas = useCallback(
    (canvasId: string, options?: { replace?: boolean }) => {
      const nextPath = getCanvasRoute(canvasId)
      const currentRoute = `${location.pathname}${location.search}${location.hash}`
      const desiredRoute = `${nextPath}${location.search}${location.hash}`

      if (currentRoute === desiredRoute) {
        return
      }

      navigate(nextPath, { replace: options?.replace ?? false })
    },
    [getCanvasRoute, location.hash, location.pathname, location.search, navigate]
  )

  const setSelectedNodeIdsIfChanged = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds((currentNodeIds) => (areStringArraysEqual(currentNodeIds, nodeIds) ? currentNodeIds : nodeIds))
  }, [])

  const setFollowRequestIfChanged = useCallback((request: AgentCanvasFollowRequest | null) => {
    setFollowRequest((currentRequest) => (areFollowRequestsEqual(currentRequest, request) ? currentRequest : request))
  }, [])

  const restoreSelectionForCanvas = useCallback(
    (canvasId: string, preferredNodeId?: string | null) => {
      const root = rootRef.current
      if (!root) {
        return
      }

      const canvas = findCanvasById(root, canvasId)
      if (!canvas) {
        setSelectedNodeIdsIfChanged([])
        setSelectedNodeId(null)
        return
      }

      const nodeItems = canvas.items.filter((i) => i.kind === 'node')
      const preferredNode = preferredNodeId ? nodeItems.find((i) => i.id === preferredNodeId) : null
      const lastNodeId = getLastSelectedNode(workspaceId, canvasId)
      const lastNode = lastNodeId ? nodeItems.find((i) => i.id === lastNodeId) : null
      const targetNodeId = preferredNode?.id ?? lastNode?.id ?? nodeItems[0]?.id ?? null

      if (!targetNodeId) {
        setSelectedNodeIdsIfChanged([])
        setSelectedNodeId(null)
        return
      }

      setSelectedNodeIdsIfChanged([targetNodeId])
      setSelectedNodeId(targetNodeId)
      setLastSelectedNode(workspaceId, canvasId, targetNodeId)
    },
    [setSelectedNodeIdsIfChanged, workspaceId]
  )

  const applyFollowRequest = useCallback(
    (request: AgentCanvasFollowRequest) => {
      setFitSelectedNode(false)
      setSelectedNodeIdsIfChanged([request.selectedNodeId])
      setSelectedNodeId(null)
      setFocusedNodeId(null)
      setFollowRequestIfChanged(request)
      setLastSelectedNode(workspaceId, request.canvasId, request.selectedNodeId)
    },
    [setFollowRequestIfChanged, setSelectedNodeIdsIfChanged, workspaceId]
  )

  const requestCanvasFit = useCallback((canvasId: string): CanvasFitRequest => {
    fitCanvasRequestSequenceRef.current += 1
    const request = {
      canvasId,
      key: `${canvasId}:${fitCanvasRequestSequenceRef.current}`,
    }
    setFitCanvasRequest(request)
    return request
  }, [])

  const handleFitCanvasRequestHandled = useCallback(
    (requestKey: string) => {
      const pendingFollowRequest = getFollowRequestAfterHandledFit({
        pendingFollow: pendingFollowAfterFitRef.current,
        fitRequest: fitCanvasRequestRef.current,
        handledFitRequestKey: requestKey,
        activeCanvasId: activeCanvasIdRef.current,
      })

      setFitCanvasRequest((currentRequest) => (currentRequest?.key === requestKey ? null : currentRequest))

      if (pendingFollowAfterFitRef.current?.fitRequestKey === requestKey) {
        pendingFollowAfterFitRef.current = null
      }

      if (pendingFollowRequest) {
        applyFollowRequest(pendingFollowRequest)
      }
    },
    [applyFollowRequest]
  )

  useEffect(() => {
    if (!hasInitiallySynced || !store.root) {
      return
    }

    if (normalizedRouteCanvasPath.length > 0 && !resolvedRouteCanvasId) {
      setPendingCanvasAction(null)
      pendingFollowAfterFitRef.current = null
      setFitSelectedNode(false)
      navigateToCanvas('root', { replace: true })
      return
    }

    const nextCanvasId = resolvedRouteCanvasId ?? 'root'
    if (activeCanvasId !== nextCanvasId) {
      setActiveCanvasId(nextCanvasId)
    }
  }, [
    activeCanvasId,
    hasInitiallySynced,
    navigateToCanvas,
    normalizedRouteCanvasPath,
    resolvedRouteCanvasId,
    setActiveCanvasId,
    store.root,
  ])

  useEffect(() => {
    if (!activeCanvasId) {
      return
    }

    setFitCanvasRequest((currentRequest) => {
      if (currentRequest && currentRequest.canvasId !== activeCanvasId) {
        if (pendingFollowAfterFitRef.current?.fitRequestKey === currentRequest.key) {
          pendingFollowAfterFitRef.current = null
        }
        return null
      }

      return currentRequest
    })
  }, [activeCanvasId])

  useEffect(() => {
    if (!hasInitiallySynced || !store.root || !activeCanvasId) {
      return
    }

    const pendingAction = pendingCanvasAction
    const pendingFollow = pendingFollowAfterFitRef.current
    const pendingFollowTargetsActiveCanvas = pendingFollow?.canvasId === activeCanvasId
    const canvasChanged = lastHandledCanvasIdRef.current !== activeCanvasId
    if (
      !canvasChanged &&
      !(pendingAction && pendingAction.canvasId === activeCanvasId) &&
      !pendingFollowTargetsActiveCanvas
    ) {
      return
    }

    lastHandledCanvasIdRef.current = activeCanvasId

    if (canvasChanged) {
      setFocusedNodeId(null)
      setFollowRequestIfChanged(null)
      if (pendingFollowAfterFitRef.current && pendingFollowAfterFitRef.current.canvasId !== activeCanvasId) {
        pendingFollowAfterFitRef.current = null
      }
    }

    if (pendingAction?.canvasId === activeCanvasId) {
      pendingFollowAfterFitRef.current = null

      if (pendingAction.nodeId) {
        setLastSelectedNode(workspaceId, activeCanvasId, pendingAction.nodeId)
      }

      if (pendingAction.focus && pendingAction.nodeId) {
        setSelectedNodeIdsIfChanged([])
        setSelectedNodeId(null)
        setFollowRequestIfChanged(null)
        setFocusedNodeId(pendingAction.nodeId)
      } else {
        setFollowRequestIfChanged(null)
        if (!pendingAction.nodeId) {
          setFitSelectedNode(false)
          requestCanvasFit(activeCanvasId)
        }
        restoreSelectionForCanvas(activeCanvasId, pendingAction.nodeId ?? null)
      }

      setPendingCanvasAction(null)
      return
    }

    if (pendingFollowAfterFitRef.current?.canvasId === activeCanvasId) {
      const nextPendingFollow = pendingFollowAfterFitRef.current
      if (!nextPendingFollow.fitRequestKey) {
        const fitRequest = requestCanvasFit(activeCanvasId)
        pendingFollowAfterFitRef.current = {
          ...nextPendingFollow,
          fitRequestKey: fitRequest.key,
        }
      }
      setFitSelectedNode(false)
      setSelectedNodeIdsIfChanged([])
      setSelectedNodeId(null)
      setFocusedNodeId(null)
      setFollowRequestIfChanged(null)
      return
    }

    pendingFollowAfterFitRef.current = null
    setFitSelectedNode(false)
    requestCanvasFit(activeCanvasId)
    restoreSelectionForCanvas(activeCanvasId)
  }, [
    activeCanvasId,
    hasInitiallySynced,
    pendingCanvasAction,
    requestCanvasFit,
    restoreSelectionForCanvas,
    setFollowRequestIfChanged,
    setSelectedNodeIdsIfChanged,
    store.root,
    workspaceId,
  ])

  // Persist active canvas to localStorage when it changes
  useEffect(() => {
    if (activeCanvasId) {
      setLastActiveCanvas(workspaceId, activeCanvasId)
    }
  }, [activeCanvasId, workspaceId])

  // Fade transition when switching canvases
  useEffect(() => {
    // Skip on initial mount or when no canvas
    if (!activeCanvasId || !prevCanvasIdRef.current) {
      prevCanvasIdRef.current = activeCanvasId
      return
    }

    // Only animate if actually switching to a different canvas
    if (prevCanvasIdRef.current !== activeCanvasId) {
      // Exit focus mode when switching canvases (node IDs are canvas-specific)
      exitFocusMode()
      setCanvasOpacity(0)
      // Fade back in after canvas remounts and viewport is positioned
      const timer = setTimeout(() => setCanvasOpacity(1), 80)
      prevCanvasIdRef.current = activeCanvasId
      return () => clearTimeout(timer)
    }
  }, [activeCanvasId])

  // Sync sidebar width to CSS variable for elements that need real-time positioning during resize
  useEffect(() => {
    const width = sidebarOpen && !zenMode && !fullScreenMode ? sidebarWidth : 0
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
  }, [sidebarWidth, sidebarOpen, zenMode, fullScreenMode])

  // Mutable canvas proxy — stable reference, CanvasFlow snapshots it internally
  const mutableCanvas = useMemo(() => {
    void structureFingerprint
    return activeCanvasId && store.root ? findCanvasById(store.root, activeCanvasId) : null
  }, [structureFingerprint, activeCanvasId, store.root])

  // Workspace interlink suggestions — computed once per structural change + canvas switch

  const interlinkSuggestions = useMemo(() => {
    void structureFingerprint
    if (!store.root) return []
    return buildWorkspaceInterlinkSuggestions(store.root as CanvasItem, activeCanvasId)
  }, [structureFingerprint, activeCanvasId, store])
  const activeCanvasFitRequestKey = fitCanvasRequest?.canvasId === activeCanvasId ? fitCanvasRequest.key : null
  const shouldShowInitialFitOverlay = shouldShowActiveCanvasInitialFitOverlay({
    activeCanvasId,
    lastHandledCanvasId: lastHandledCanvasIdRef.current,
    fitCanvasRequest,
  })
  const initialFitOverlayStyle = getInitialFitOverlayStyle(shouldShowInitialFitOverlay)

  // Handle node selection from tree sidebar (single click)
  // Uses ref to keep callback stable (prevents react-arborist drag breakage)
  const handleNodeSelect = useCallback(
    (nodeId: string, canvasId: string) => {
      setFitCanvasRequest(null)
      setFollowRequestIfChanged(null)
      pendingFollowAfterFitRef.current = null

      if (activeCanvasIdRef.current !== canvasId) {
        setPendingCanvasAction({ canvasId, nodeId })
        navigateToCanvas(canvasId)
      } else {
        setSelectedNodeIdsIfChanged([nodeId])
        setSelectedNodeId(nodeId)
        setLastSelectedNode(workspaceId, canvasId, nodeId)
      }

      // Set the selected node (will trigger focus in CanvasFlow)
      setFitSelectedNode(true)
    },
    [navigateToCanvas, setFollowRequestIfChanged, setSelectedNodeIdsIfChanged, workspaceId]
  )

  // Handle node focus from tree sidebar (double click) - zooms to 100%
  const handleNodeFocus = useCallback(
    (nodeId: string, canvasId: string) => {
      setFitCanvasRequest(null)
      setFollowRequestIfChanged(null)
      pendingFollowAfterFitRef.current = null

      if (activeCanvasIdRef.current !== canvasId) {
        setPendingCanvasAction({ canvasId, nodeId, focus: true })
        navigateToCanvas(canvasId)
      } else {
        setFocusedNodeId(nodeId)
      }
    },
    [navigateToCanvas, setFollowRequestIfChanged]
  )

  const handleFollowRequest = useCallback(
    (request: AgentCanvasFollowRequest) => {
      setFitSelectedNode(false)

      const pendingFollow = pendingFollowAfterFitRef.current
      if (pendingFollow?.canvasId === request.canvasId) {
        pendingFollowAfterFitRef.current = {
          ...pendingFollow,
          request,
        }
        setPendingCanvasAction(null)
        setFollowRequestIfChanged(null)
        return
      }

      if (activeCanvasIdRef.current !== request.canvasId) {
        setFitCanvasRequest(null)
        pendingFollowAfterFitRef.current = {
          canvasId: request.canvasId,
          request,
        }
        setPendingCanvasAction(null)
        setFollowRequestIfChanged(null)
        navigateToCanvas(request.canvasId)
        return
      }

      setFitCanvasRequest(null)
      pendingFollowAfterFitRef.current = null
      applyFollowRequest(request)
    },
    [applyFollowRequest, navigateToCanvas, setFollowRequestIfChanged]
  )

  // Handle canvas selection from tree sidebar
  // Uses ref to keep callback stable (prevents react-arborist drag breakage)
  const handleCanvasSelect = useCallback(
    (canvasId: string) => {
      const currentActiveCanvasId = activeCanvasIdRef.current

      // Don't fit to node when clicking on canvas - just restore viewport
      setFitSelectedNode(false)
      setFollowRequestIfChanged(null)
      pendingFollowAfterFitRef.current = null

      // If clicking on already active canvas - just ensure something is selected
      if (canvasId === currentActiveCanvasId) {
        restoreSelectionForCanvas(canvasId)
        return
      }

      setPendingCanvasAction({ canvasId })
      navigateToCanvas(canvasId)
    },
    [navigateToCanvas, restoreSelectionForCanvas, setFollowRequestIfChanged]
  )

  // Handle search result selection with optional content highlight
  const handleSearchSelect = useCallback(
    (result: SearchResult, query: string) => {
      if (result.type === 'canvas') {
        handleCanvasSelect(result.canvasId)
      } else {
        // Use focus (zoom to 100%) for search results
        handleNodeFocus(result.id, result.canvasId)
        // If it's a content match, set up pending highlight
        if (result.matchType === 'content' && query) {
          setPendingHighlight({ nodeId: result.id, query })
        }
      }
    },
    [handleCanvasSelect, handleNodeFocus]
  )

  // Import a GBrain markdown page into the active canvas as a BlockNote node.
  const handleGBrainPageImport = useCallback(
    async (pagePath: string) => {
      const canvasId = activeCanvasIdRef.current
      if (!canvasId) {
        showToast('No active canvas selected', 'error')
        return
      }

      try {
        const page = await readGBrainPage(workspaceId, pagePath)
        const importedMarkdown = `> Imported from GBrain: \`${page.path}\`\n\n${page.markdown}`
        const nodeId = addBlockNoteNodeFromImport({
          content: importedMarkdown,
          format: 'markdown',
          documentName: page.title,
          canvasId,
        })

        if (!nodeId) {
          return
        }

        showToast(`Imported ${page.title} from GBrain`, 'success')
        handleNodeFocus(nodeId, canvasId)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to import GBrain page', 'error')
      }
    },
    [addBlockNoteNodeFromImport, handleNodeFocus, workspaceId]
  )

  const handleWorkspaceLinkNavigate = useCallback(
    (href: string) => {
      const rootCanvas = rootRef.current
      if (!rootCanvas) {
        return true
      }

      const resolved = resolveWorkspaceLink(rootCanvas, href)

      if (resolved.type === 'external') {
        return false
      }

      if (resolved.type === 'node') {
        handleNodeSelect(resolved.nodeId, resolved.canvasId)
        return true
      }

      if (resolved.type === 'canvas') {
        handleCanvasSelect(resolved.canvasId)
        return true
      }

      if (resolved.type === 'unsupported') {
        showToast('metadata.yaml links are not supported yet', 'error')
        return true
      }

      showToast('Linked workspace item was not found', 'error')
      return true
    },
    [handleNodeSelect, handleCanvasSelect]
  )

  // Handle selection changes from canvas (user clicking/dragging in canvas)
  // Uses refs to keep callback stable and avoid stale closures
  const handleSelectionChange = useCallback(
    (nodeIds: string[]) => {
      setSelectedNodeIdsIfChanged(nodeIds)

      const pendingSelectedNodeId = selectedNodeIdRef.current
      if (!shouldKeepProgrammaticNodeTarget(pendingSelectedNodeId, nodeIds)) {
        setSelectedNodeId(null)
      }

      const pendingFocusedNodeId = focusedNodeIdRef.current
      if (!shouldKeepProgrammaticNodeTarget(pendingFocusedNodeId, nodeIds)) {
        setFocusedNodeId(null)
      }

      const pendingFollowRequest = followRequestRef.current
      if (!shouldKeepProgrammaticNodeTarget(pendingFollowRequest?.selectedNodeId ?? null, nodeIds)) {
        setFollowRequestIfChanged(null)
      }

      // Clear text selection if the selected nodes don't include the text-selected node
      // This prevents "2 selected" showing when clicking between nodes
      const currentTextSelection = textSelectionStore.getSnapshot()
      if (currentTextSelection && !nodeIds.includes(currentTextSelection.nodeId)) {
        textSelectionStore.setTextSelection(null)
      }

      const currentCanvasId = activeCanvasIdRef.current
      if (currentCanvasId) {
        if (nodeIds.length === 1) {
          // Save last selected node to localStorage (only for single selection)
          setLastSelectedNode(workspaceId, currentCanvasId, nodeIds[0])
        } else if (nodeIds.length === 0) {
          // Clear localStorage when deselecting all (clicking on empty canvas)
          setLastSelectedNode(workspaceId, currentCanvasId, null)
        }
      }
    },
    [setFollowRequestIfChanged, setSelectedNodeIdsIfChanged, workspaceId, textSelectionStore]
  )

  const handleDeselectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeIds((prev) => (prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : prev))
      if (selectedNodeIdRef.current === nodeId) {
        setSelectedNodeId(null)
      }
      if (focusedNodeIdRef.current === nodeId) {
        setFocusedNodeId(null)
      }
      if (followRequestRef.current?.selectedNodeId === nodeId) {
        setFollowRequestIfChanged(null)
      }
    },
    [setFollowRequestIfChanged]
  )

  const handleNodeFocused = useCallback(() => {
    setSelectedNodeId(null)
    setFocusedNodeId(null)
  }, [])

  const handleNodeFollowed = useCallback(() => {
    setFollowRequestIfChanged(null)
  }, [setFollowRequestIfChanged])

  useEffect(() => {
    if (!isReconnecting) {
      setShowReconnectIndicator(false)
      return
    }

    const reconnectTimer = window.setTimeout(() => {
      setShowReconnectIndicator(true)
    }, RECONNECTING_INDICATOR_DELAY_MS)

    return () => window.clearTimeout(reconnectTimer)
  }, [isReconnecting])

  // Wait for initial sync to complete before rendering workspace
  // This prevents any code from writing to proxy before Yjs data arrives
  // Note: hasInitiallySynced only goes true once, never resets on reconnection
  if (!hasInitiallySynced) {
    if (initialSyncError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="max-w-md space-y-2">
            <h1 className="text-lg font-semibold text-foreground">Workspace failed to load</h1>
            <p className="text-sm text-foreground-muted">{initialSyncError}</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="canvas-btn rounded-full px-4 py-2 text-sm font-medium"
          >
            Reload workspace
          </button>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center h-screen">
        <img src={thinkingAnimation} alt="" className="w-12 h-12" />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!isConnected && !isReconnecting && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-100 flex items-center gap-3 rounded-md bg-red-100 px-4 py-2 text-sm text-red-800 shadow-md dark:bg-red-950 dark:text-red-200">
          <div className="flex flex-col">
            <span>Disconnected. Changes won't sync until the workspace reconnects.</span>
            {disconnectDetail ? <span className="text-xs opacity-80">{disconnectDetail}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-current px-3 py-1 text-xs font-medium"
          >
            Reload
          </button>
        </div>
      )}

      {/* Reconnecting indicator - non-blocking */}
      {showReconnectIndicator && isReconnecting && !isConnected && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-100 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-md text-sm shadow-md">
          Reconnecting...
        </div>
      )}
      <WorkspaceInterlinksProvider value={interlinkSuggestions}>
        <ReactFlowProvider>
          <ProjectStateProvider>
            <KanwasEditorManager />
            <SearchHighlighter pendingHighlight={pendingHighlight} onComplete={() => setPendingHighlight(null)} />
            <NodesSelectionProvider>
              <ChatProvider workspaceId={workspaceId}>
                <RealtimeMarkdownWriteController />
                <WorkspaceSidebar
                  root={sidebarRoot}
                  activeCanvasId={activeCanvasId}
                  onCanvasSelect={handleCanvasSelect}
                  onNodeSelect={handleNodeSelect}
                  onNodeFocus={handleNodeFocus}
                  selectedNodeIds={selectedNodeIds}
                />

                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                  {!zenMode && !fullScreenMode && (
                    <Chat
                      workspaceId={workspaceId}
                      onboardingStatus={workspace?.onboardingStatus}
                      onNodeSelect={handleNodeSelect}
                      onFollowRequest={handleFollowRequest}
                      onCanvasSelect={handleCanvasSelect}
                      onWorkspaceLinkNavigate={handleWorkspaceLinkNavigate}
                      selectedNodeIds={selectedNodeIds}
                      onDeselectNode={handleDeselectNode}
                    />
                  )}

                  <div className="flex-1 relative z-0 isolate bg-canvas overflow-hidden">
                    <div
                      className="absolute inset-0"
                      style={{
                        opacity: canvasOpacity,
                        transition: 'opacity 100ms ease-out',
                      }}
                    >
                      <div
                        className="absolute top-4 z-50 flex gap-0 items-center"
                        style={{
                          right: 'calc(var(--sidebar-width, 0px) + 16px)',
                        }}
                      >
                        <HelpButton />
                        <ZoomResetButton />
                        <ThemeToggle />
                        {(!sidebarOpen || zenMode || fullScreenMode) && (
                          <button
                            onClick={() => {
                              if (fullScreenMode) disableFullScreenMode()
                              if (!sidebarOpen) toggleSidebar()
                            }}
                            className="canvas-btn w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200
                                       hover:scale-110 active:scale-95 cursor-pointer"
                            aria-label="Open sidebar"
                          >
                            <i className="fa-regular fa-sidebar text-sm text-foreground" />
                          </button>
                        )}
                      </div>

                      {mutableCanvas ? (
                        <CanvasFlow
                          key={activeCanvasId!}
                          mutableCanvas={mutableCanvas}
                          selectedNodeIds={selectedNodeIds}
                          selectedNodeId={selectedNodeId}
                          focusedNodeId={focusedNodeId}
                          followRequest={followRequest}
                          fitSelectedNode={fitSelectedNode}
                          fitCanvasRequestKey={activeCanvasFitRequestKey}
                          onNodeFocused={handleNodeFocused}
                          onNodeFollowed={handleNodeFollowed}
                          onSelectionChange={handleSelectionChange}
                          onCanvasSelect={handleCanvasSelect}
                          onWorkspaceLinkNavigate={handleWorkspaceLinkNavigate}
                          onFitCanvasRequestHandled={handleFitCanvasRequestHandled}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full bg-canvas">
                          <div className="text-center text-gray-500">
                            <p className="text-lg">No canvas selected</p>
                            <p className="text-sm">Select a canvas from the sidebar</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 z-[60] bg-canvas"
                      style={initialFitOverlayStyle}
                    />
                  </div>
                </div>
              </ChatProvider>
            </NodesSelectionProvider>
          </ProjectStateProvider>
        </ReactFlowProvider>
      </WorkspaceInterlinksProvider>

      {/* Search modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        root={sidebarRoot}
        yDoc={yDoc}
        contentStore={contentStore}
        onSelect={handleSearchSelect}
        activeCanvasId={activeCanvasId}
        workspaceId={workspaceId}
        onImportGBrainPage={handleGBrainPageImport}
      />
    </div>
  )
}

export function WorkspacePage({
  workspaceId,
  workspace,
  routeCanvasPath = '',
}: {
  workspaceId?: string
  workspace?: Workspace
  routeCanvasPath?: string
}) {
  const finalWorkspaceId = workspaceId || 'test-workspace'

  return (
    <WorkspaceProvider workspaceId={finalWorkspaceId}>
      <WorkspaceContent routeCanvasPath={routeCanvasPath} workspace={workspace} />
    </WorkspaceProvider>
  )
}
