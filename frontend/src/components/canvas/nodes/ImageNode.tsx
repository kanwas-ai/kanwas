import { memo, useState } from 'react'
import { NodeResizeControl } from '@xyflow/react'
import type { ImageNode as ImageNodeType } from 'shared'
import { IMAGE_NODE_LAYOUT, NODE_NAME_HEIGHT } from 'shared/constants'
import { tuyau } from '@/api/client'
import { useSignedUrl } from '@/hooks/useSignedUrl'
import { showToast } from '@/utils/toast'
import { DocumentName } from './DocumentName'
import { RESIZE_HANDLE_SIZE } from './ResizeHandle'
import type { WithCanvasData } from '../types'

const controlStyle: React.CSSProperties = {
  width: RESIZE_HANDLE_SIZE,
  height: RESIZE_HANDLE_SIZE,
  background: 'transparent',
  border: 'none',
  translate: '-98% -98%',
  zIndex: 10,
  cursor: 'se-resize',
  userSelect: 'none',
  WebkitUserSelect: 'none',
}

type ImageNodeProps = WithCanvasData<ImageNodeType>

// Get file extension from mimeType (e.g., "image/png" → ".png")
function getExtensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split('/')[1]
  if (!subtype) return ''
  if (subtype === 'jpeg') return '.jpg'
  return `.${subtype}`
}

function getDownloadFilename(documentName: string, extension: string): string {
  if (!extension) return documentName
  return documentName.toLowerCase().endsWith(extension.toLowerCase()) ? documentName : `${documentName}${extension}`
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export default memo(function ImageNode({ selected, id, data, width, height }: ImageNodeProps) {
  const { documentName: docName, onFocusNode } = data
  const documentName = docName || 'Image'
  const extension = getExtensionFromMimeType(data.mimeType)

  const handleDoubleClick = () => {
    onFocusNode?.(id)
  }

  const [imageError, setImageError] = useState(false)
  const [, setImageLoaded] = useState(false)

  const { data: signedUrl, isLoading, error } = useSignedUrl(data.storagePath, data.contentHash)

  const nodeWidth = positiveNumber(width) ?? IMAGE_NODE_LAYOUT.DEFAULT_MEASURED.width
  const nodeHeight = positiveNumber(height) ?? IMAGE_NODE_LAYOUT.DEFAULT_MEASURED.height
  const imageHeight = Math.max(0, nodeHeight - NODE_NAME_HEIGHT)

  const handleImageLoad = () => {
    setImageLoaded(true)
    setImageError(false)
  }

  const handleImageError = () => {
    setImageError(true)
    setImageLoaded(false)
  }

  const handleRetry = () => {
    setImageError(false)
    setImageLoaded(false)
  }

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()

    try {
      const filename = getDownloadFilename(documentName, extension)
      const response = await tuyau.files['signed-url'].$get({
        query: {
          path: data.storagePath,
          download: '1',
          filename,
        },
      })

      const downloadUrl = response.data?.url
      if (!downloadUrl) {
        throw new Error('Missing download URL')
      }

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      showToast('Failed to download image', 'error')
    }
  }

  return (
    <div className="group relative">
      <div
        className="transition-opacity"
        style={{ opacity: selected ? 1 : 0, pointerEvents: selected ? undefined : 'none' }}
      >
        <DocumentName
          nodeId={id}
          documentName={documentName}
          extension={extension}
          containerStyle={{ width: nodeWidth, maxWidth: nodeWidth }}
        />
      </div>
      <div className="relative group">
        <NodeResizeControl
          position="bottom-right"
          className="!cursor-se-resize !select-none opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
          style={controlStyle}
          minWidth={IMAGE_NODE_LAYOUT.MIN_WIDTH}
          minHeight={IMAGE_NODE_LAYOUT.MIN_HEIGHT + NODE_NAME_HEIGHT}
          maxWidth={IMAGE_NODE_LAYOUT.MAX_WIDTH}
          keepAspectRatio
          shouldResize={() => true}
          autoScale={false}
        >
          <svg
            width={RESIZE_HANDLE_SIZE}
            height={RESIZE_HANDLE_SIZE}
            viewBox="0 0 26 26"
            fill="none"
            className="pointer-events-none block"
          >
            <path d="M24 2V24H2" stroke="#999" strokeWidth={3} strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        </NodeResizeControl>
        <div
          className="box-border relative overflow-hidden"
          style={{
            width: nodeWidth,
            height: imageHeight,
          }}
          onDoubleClick={handleDoubleClick}
        >
          {/* Loading state */}
          {isLoading && (
            <div className="nodrag absolute inset-0 flex items-center justify-center select-none">
              <div className="flex flex-col items-center gap-2 text-foreground-muted">
                <div className="w-8 h-8 border-2 border-foreground-muted border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading image...</span>
              </div>
            </div>
          )}

          {/* Error state - failed to get signed URL */}
          {error && !isLoading && (
            <div className="nodrag absolute inset-0 flex items-center justify-center select-none">
              <div className="flex flex-col items-center gap-2 text-foreground-muted">
                <i className="fa-solid fa-exclamation-triangle text-2xl text-yellow-500" />
                <span className="text-sm">Failed to load image URL</span>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1 text-xs bg-block-highlight hover:bg-outline rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Image error state */}
          {signedUrl && !error && imageError && (
            <div className="nodrag absolute inset-0 flex items-center justify-center select-none">
              <div className="flex flex-col items-center gap-2 text-foreground-muted">
                <i className="fa-solid fa-image-slash text-3xl" />
                <span className="text-sm">Failed to load image</span>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1 text-xs bg-block-highlight hover:bg-outline rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Actual image - draggable */}
          {signedUrl && !error && !imageError && (
            <>
              <button
                type="button"
                onClick={handleDownload}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="nodrag absolute top-3 right-3 z-20 flex w-11 h-11 items-center justify-center rounded-xl border border-outline/70 bg-canvas/85 opacity-0 pointer-events-none shadow-sm backdrop-blur-md transition-opacity transition-colors group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-canvas hover:text-foreground active:scale-[0.98] active:bg-canvas active:shadow-none !cursor-pointer !select-none"
                style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
                title="Download image"
                aria-label="Download image"
              >
                <i className="fa-solid fa-download text-lg text-foreground/80 pointer-events-none" />
              </button>
              <img
                src={signedUrl}
                alt={documentName}
                onLoad={handleImageLoad}
                onError={handleImageError}
                draggable={false}
                className="pointer-events-none select-none w-full h-full object-cover"
                style={{ userSelect: 'none', WebkitUserDrag: 'none' } as React.CSSProperties}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
})
