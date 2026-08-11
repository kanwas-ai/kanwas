import { memo, useEffect, useRef, useState } from 'react'
import { NodeResizeControl } from '@xyflow/react'
import type { LinkNode as LinkNodeType } from 'shared'
import { LINK_IFRAME_LAYOUT, LINK_NODE_LAYOUT, findTargetCanvas } from 'shared/constants'
import { useSnapshot } from 'valtio/react'
import { DocumentName } from './DocumentName'
import { useSignedUrl } from '@/hooks/useSignedUrl'
import { getDefaultSandbox, getEmbedSandbox, isSafeExternalUrl, resolveEmbed } from '@/lib/embeds'
import { useWorkspace } from '@/providers/workspace/WorkspaceContext'
import { useNodesSelection } from '@/providers/nodes-selection'
import { ResizeHandle } from './ResizeHandle'
import { useFetchLinkMetadata, useUserFacingNodeEdit } from '../hooks'
import type { WithCanvasData } from '../types'
import { NODE_NAME_HEIGHT } from '../canvasLayout'
import { showToast } from '@/utils/toast'

type LinkNodeProps = WithCanvasData<LinkNodeType>

const RESIZE_HANDLE_SIZE = 32
const DARK_HANDLE_COLOR = '#111111'

const controlStyle: React.CSSProperties = {
  width: RESIZE_HANDLE_SIZE,
  height: RESIZE_HANDLE_SIZE,
  background: 'transparent',
  border: 'none',
  translate: '-98% -98%',
  zIndex: 11,
  cursor: 'se-resize',
  userSelect: 'none',
  WebkitUserSelect: 'none',
}

function ToolbarButton({ onClick, title, icon }: { onClick: () => void; title: string; icon: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="nodrag flex h-9 w-9 items-center justify-center rounded-xl border border-outline/70 bg-canvas/85 text-foreground/70 shadow-sm backdrop-blur-md transition-colors hover:bg-canvas hover:text-foreground active:scale-[0.98] !cursor-pointer !select-none"
      title={title}
      aria-label={title}
    >
      <i className={`fa-solid ${icon} text-sm pointer-events-none`} />
    </button>
  )
}

export default memo(function LinkNode({ id, data, selected, width, height }: LinkNodeProps) {
  const { onFocusNode, onSelectNode, url, imageStoragePath, title, description, loadingStatus, displayMode } = data
  const { store, activeCanvasId, workspaceId } = useWorkspace()
  const { state: nodesSelectionState } = useNodesSelection()
  const { selectedNodeIds } = useSnapshot(nodesSelectionState)
  const editNode = useUserFacingNodeEdit()
  const [iframeLoadFailed, setIframeLoadFailed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [showResizePlaceholder, setShowResizePlaceholder] = useState(false)
  const [isInteractive, setIsInteractive] = useState(false)
  const overlayPointerDownRef = useRef<{ x: number; y: number } | null>(null)

  // Get node name from store for DocumentName
  const canvas = findTargetCanvas(store.root, activeCanvasId ?? undefined)
  const nodeItem = canvas?.items.find((i) => i.kind === 'node' && i.id === id)
  const documentName = nodeItem?.name || 'Link'
  const isIframeMode = displayMode === 'iframe'
  const isSafeUrl = isSafeExternalUrl(url)
  const resolvedEmbed = resolveEmbed(url)
  const embedDefinition = resolvedEmbed?.definition
  const iframeMinWidth = embedDefinition?.minWidth ?? LINK_IFRAME_LAYOUT.MIN_WIDTH
  const iframeMinHeight = embedDefinition?.minHeight ?? LINK_IFRAME_LAYOUT.MIN_HEIGHT
  const iframeSrc = isSafeUrl ? (resolvedEmbed?.embedUrl ?? url) : undefined
  const iframeSandbox = resolvedEmbed ? getEmbedSandbox(resolvedEmbed) : getDefaultSandbox()
  const iframeWidth = width ?? LINK_IFRAME_LAYOUT.WIDTH
  const totalIframeHeight = height ?? LINK_IFRAME_LAYOUT.HEIGHT + NODE_NAME_HEIGHT
  const iframeHeight = Math.max(iframeMinHeight, totalIframeHeight - NODE_NAME_HEIGHT)
  const showEmbedUnavailable = (!isSafeUrl || iframeLoadFailed) && !isResizing
  const isSingleSelected = selected && selectedNodeIds.length === 1 && selectedNodeIds[0] === id
  const shouldShowCanvasOverlay = !isInteractive

  const handleDoubleClick = () => {
    onFocusNode?.(id)
  }

  // Fetch signed URL for OG image if we have one
  const { data: imageUrl } = useSignedUrl(imageStoragePath)

  // Fetch OG metadata hook
  const { mutate: fetchMetadata, isPending: metadataLoading } = useFetchLinkMetadata()

  // Trigger metadata fetch on mount if pending
  useEffect(() => {
    if (loadingStatus === 'pending' && activeCanvasId) {
      fetchMetadata({ nodeId: id, url, workspaceId, canvasId: activeCanvasId })
    }
  }, [loadingStatus, fetchMetadata, id, url, workspaceId, activeCanvasId])

  const isLoading = loadingStatus === 'pending' || metadataLoading
  const hasError = loadingStatus === 'error'
  const hasDescription = typeof description === 'string' && description.trim().length > 0
  const showImagePreview = Boolean(imageUrl) && !isLoading && !hasError

  // Parse hostname safely
  let hostname = url
  try {
    hostname = new URL(url).hostname
  } catch {
    /* use raw url */
  }
  // Handle click to open URL
  const handleClick = () => {
    if (!isSafeUrl) {
      showToast('Only http and https links can be opened', 'error')
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleToggleDisplayMode = () => {
    setIframeLoadFailed(false)

    editNode(id, (node) => {
      const nodeData = node.xynode.data as LinkNodeType['data']
      const nextDisplayMode = nodeData.displayMode === 'iframe' ? 'preview' : 'iframe'
      nodeData.displayMode = nextDisplayMode

      if (nextDisplayMode === 'iframe') {
        const nextWidth = node.xynode.width ?? embedDefinition?.width ?? LINK_IFRAME_LAYOUT.WIDTH
        const nextHeight =
          node.xynode.height ?? (embedDefinition?.height ?? LINK_IFRAME_LAYOUT.HEIGHT) + NODE_NAME_HEIGHT

        node.xynode.width = nextWidth
        node.xynode.height = nextHeight
        node.xynode.measured = {
          width: nextWidth,
          height: nextHeight,
        }

        return
      }

      node.xynode.width = undefined
      node.xynode.height = undefined
      node.xynode.measured = LINK_NODE_LAYOUT.DEFAULT_MEASURED
    })
  }

  const handleResizeStart = () => {
    setShowResizePlaceholder(true)
    setIsResizing(true)
  }

  const handleResizeEnd = () => {
    setIsResizing(false)
    setIframeLoadFailed(false)
  }

  const handleIframeOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    overlayPointerDownRef.current = { x: event.clientX, y: event.clientY }
  }

  const handleIframeOverlayPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      overlayPointerDownRef.current = null
      return
    }

    const start = overlayPointerDownRef.current
    overlayPointerDownRef.current = null

    if (!start) {
      return
    }

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    const movedTooFar = Math.hypot(deltaX, deltaY) > 4

    if (movedTooFar) {
      return
    }

    event.stopPropagation()

    if (!isSingleSelected) {
      onSelectNode?.(id)
    }

    requestAnimationFrame(() => {
      setIsInteractive(true)
    })
  }

  const handleIframeOverlayWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    if (isResizing || !showResizePlaceholder) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShowResizePlaceholder(false)
    }, 160)

    return () => window.clearTimeout(timeoutId)
  }, [isResizing, showResizePlaceholder])

  useEffect(() => {
    if (!isSingleSelected && isInteractive) {
      setIsInteractive(false)
    }
  }, [isInteractive, isSingleSelected])

  useEffect(() => {
    if ((!isIframeMode || showEmbedUnavailable || isResizing) && isInteractive) {
      setIsInteractive(false)
    }
  }, [isIframeMode, isInteractive, isResizing, showEmbedUnavailable])

  useEffect(() => {
    if (!isInteractive) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInteractive(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isInteractive])

  return (
    <div className="relative">
      <DocumentName
        nodeId={id}
        documentName={documentName}
        containerClassName={isIframeMode ? 'link-node-drag-handle' : undefined}
        containerStyle={isIframeMode ? { maxWidth: iframeWidth } : undefined}
      />

      {isIframeMode ? (
        <div className="relative group">
          <NodeResizeControl
            position="bottom-right"
            className="!cursor-se-resize !select-none opacity-100 pointer-events-auto"
            style={controlStyle}
            minWidth={iframeMinWidth}
            minHeight={iframeMinHeight + NODE_NAME_HEIGHT}
            keepAspectRatio={embedDefinition?.isAspectRatioLocked}
            shouldResize={() => true}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            autoScale={false}
          >
            <ResizeHandle color={DARK_HANDLE_COLOR} />
          </NodeResizeControl>

          <div
            className={`relative overflow-hidden rounded-[24px] border-2 bg-editor ${
              selected ? 'border-editor-selected-outline' : 'border-outline'
            }`}
            onDoubleClick={handleDoubleClick}
            style={{ width: iframeWidth, height: iframeHeight }}
          >
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <ToolbarButton onClick={handleToggleDisplayMode} title="Show preview card" icon="fa-rectangle-list" />
              <ToolbarButton onClick={handleClick} title="Open link" icon="fa-arrow-up-right-from-square" />
            </div>

            <div
              className={`absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-block-highlight px-6 text-center transition-opacity duration-150 ease-out ${
                showResizePlaceholder ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <i className="fa-solid fa-globe text-3xl text-foreground-muted" />
              <div>
                <p className="text-sm font-medium text-foreground">Resizing embedded page</p>
                <p className="mt-1 text-xs text-foreground-muted">Release to reload the page at its new size.</p>
              </div>
              <span className="rounded-full bg-foreground/5 px-2 py-1 text-[11px] text-foreground/60">{hostname}</span>
            </div>

            {iframeSrc && (!isResizing || !showResizePlaceholder) && (
              <div
                className={`h-full w-full transition-opacity duration-150 ease-out ${
                  showResizePlaceholder ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {shouldShowCanvasOverlay && (
                  <div
                    className="link-node-drag-handle absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
                    onPointerDown={handleIframeOverlayPointerDown}
                    onPointerUp={handleIframeOverlayPointerUp}
                    onWheelCapture={handleIframeOverlayWheelCapture}
                  />
                )}

                {resolvedEmbed?.renderMode === 'srcDoc' ? (
                  <iframe
                    srcDoc={resolvedEmbed.srcDoc}
                    title={title || hostname}
                    className="h-full w-full bg-block-highlight"
                    sandbox={iframeSandbox}
                    referrerPolicy="strict-origin-when-cross-origin"
                    onError={() => setIframeLoadFailed(true)}
                  />
                ) : (
                  <iframe
                    src={iframeSrc}
                    title={title || hostname}
                    className="h-full w-full bg-block-highlight"
                    sandbox={iframeSandbox}
                    referrerPolicy="strict-origin-when-cross-origin"
                    onError={() => setIframeLoadFailed(true)}
                  />
                )}
              </div>
            )}

            {showEmbedUnavailable && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-editor/95 px-6 text-center">
                <i className="fa-solid fa-globe text-3xl text-foreground-muted" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isSafeUrl ? 'This site could not be embedded.' : 'Only http and https links can be embedded.'}
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {isSafeUrl
                      ? 'Open it in a new tab or switch back to the preview card.'
                      : 'Switch back to the preview card and update the link URL.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ToolbarButton onClick={handleToggleDisplayMode} title="Show preview card" icon="fa-rectangle-list" />
                  <ToolbarButton onClick={handleClick} title="Open link" icon="fa-arrow-up-right-from-square" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`
            link-node-drag-handle cursor-grab active:cursor-grabbing bg-editor border-2 rounded-[24px] overflow-hidden flex flex-col
            ${selected ? 'border-editor-selected-outline' : 'border-outline'}
          `}
          onDoubleClick={handleDoubleClick}
          style={{ width: LINK_NODE_LAYOUT.WIDTH, height: LINK_NODE_LAYOUT.HEIGHT }}
        >
          <div className="relative w-full flex-1 min-h-0 bg-block-highlight">
            <div className="absolute right-3 top-3 z-10 flex gap-2">
              <ToolbarButton
                onClick={handleToggleDisplayMode}
                title="Show embedded page"
                icon="fa-up-right-and-down-left-from-center"
              />
              <ToolbarButton onClick={handleClick} title="Open link" icon="fa-arrow-up-right-from-square" />
            </div>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                <i className="fa-solid fa-spinner fa-spin text-foreground-muted text-xl" />
              </div>
            )}
            {hasError && !imageUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <i className="fa-solid fa-link text-foreground-muted text-3xl" />
                <span className="text-foreground-muted text-sm">Preview unavailable</span>
              </div>
            )}
            {!isLoading && !hasError && !imageUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <i className="fa-solid fa-globe text-foreground-muted text-3xl" />
                <span className="text-foreground-muted text-sm">{hostname}</span>
              </div>
            )}
            {showImagePreview && (
              <img
                src={imageUrl ?? undefined}
                alt={title || 'Link preview'}
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable={false}
              />
            )}
          </div>

          <div className="bg-editor px-4 pt-[14px] pb-4 flex flex-col shrink-0">
            <div className="flex items-center justify-between h-4 gap-3">
              <span className="text-foreground/60 text-[9px] bg-foreground/5 px-1 rounded truncate max-w-full">
                {hostname}
              </span>
            </div>
            <p className="text-foreground font-semibold text-base leading-tight line-clamp-1">{title || hostname}</p>
            {hasDescription && (
              <p className="text-foreground-muted text-xs line-clamp-2 leading-tight mt-0.5">{description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
