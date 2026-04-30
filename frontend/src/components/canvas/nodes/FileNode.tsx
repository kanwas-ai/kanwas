import { memo } from 'react'
import type { FileNode as FileNodeType } from 'shared'
import { formatFileSize, getFileIconName } from 'shared/constants'
import { useSignedUrl } from '@/hooks/useSignedUrl'
import { DocumentName } from './DocumentName'
import type { WithCanvasData } from '../types'
import { fileIcons } from '@/assets/files'
import { CsvViewer } from './file/CsvViewer'
import { ErrorBoundary } from 'react-error-boundary'

// Extract extension from filename (e.g., "report.pdf" → ".pdf")
function getExtensionFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === 0) return ''
  return filename.slice(lastDot)
}

// Remove extension from filename (e.g., "report.pdf" → "report")
function removeExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === 0) return filename
  return filename.slice(0, lastDot)
}

function FileNodeComponent({ selected, id, data }: WithCanvasData<FileNodeType>) {
  const extension = getExtensionFromFilename(data.originalFilename)
  // Use documentName if set, otherwise use filename without extension
  const documentName = data.documentName || removeExtension(data.originalFilename)
  const iconName = getFileIconName(data.originalFilename)
  const iconSrc = fileIcons[iconName] || fileIcons.txt
  const { onFocusNode } = data

  const handleDoubleClick = () => {
    onFocusNode?.(id)
  }

  // Pass contentHash for cache invalidation on updates
  // isFetching is true during background refetch (when hash changes)
  const { data: signedUrl, isLoading, isFetching } = useSignedUrl(data.storagePath, data.contentHash)

  // Detect CSV/TSV files
  const isCsv =
    data.mimeType === 'text/csv' ||
    data.mimeType === 'text/tab-separated-values' ||
    data.originalFilename?.toLowerCase().endsWith('.csv') ||
    data.originalFilename?.toLowerCase().endsWith('.tsv')

  const MAX_CSV_DISPLAY_SIZE = 5 * 1024 * 1024 // 5MB
  const shouldShowCsvViewer = isCsv && data.size <= MAX_CSV_DISPLAY_SIZE

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (signedUrl) window.open(signedUrl, '_blank')
  }

  // CSV display mode - larger container with table
  if (shouldShowCsvViewer) {
    return (
      <div className="relative">
        <DocumentName nodeId={id} documentName={documentName} extension={extension} />
        <div
          className={`bg-editor rounded-[20px] border overflow-hidden
            ${selected ? 'node-card-selected' : 'border-outline'}`}
          onDoubleClick={handleDoubleClick}
        >
          {/* Updating indicator - shows during background refetch */}
          {isFetching && !isLoading && (
            <div className="absolute top-3 right-3 z-20 text-xs text-foreground-muted bg-block-highlight px-2 py-0.5 rounded">
              Updating...
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="w-[600px] h-[300px] flex items-center justify-center">
              <i className="fa-solid fa-spinner fa-spin text-foreground-muted text-xl" />
            </div>
          )}

          {/* CSV Viewer - wrapped in error boundary */}
          {signedUrl && !isLoading && (
            <div className="nodrag" style={{ width: 600, maxHeight: 360 }}>
              <ErrorBoundary
                fallback={<div className="p-4 text-center text-sm text-foreground-muted">Failed to parse CSV</div>}
              >
                <CsvViewer signedUrl={signedUrl} maxRows={10000} />
              </ErrorBoundary>
            </div>
          )}

          {/* Footer with file size + download button */}
          {signedUrl && !isLoading && (
            <div className="flex items-center justify-between px-4 border-t border-outline/30">
              <span className="text-xs text-foreground-muted">{formatFileSize(data.size)}</span>
              <button
                onClick={handleDownload}
                disabled={isLoading || !signedUrl}
                className="p-1.5 rounded-md hover:bg-block-hover transition-colors disabled:opacity-50"
                title="Download CSV"
              >
                <i className="fa-solid fa-download text-foreground/50 hover:text-foreground text-sm" />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Default file display mode - icon with download button
  return (
    <div
      className={`w-[280px] bg-editor rounded-[20px] border
        flex flex-col items-center px-6 pt-4 pb-4
        ${selected ? 'node-card-selected' : 'border-outline'}`}
      onDoubleClick={handleDoubleClick}
    >
      {/* Large icon */}
      <img src={iconSrc} alt="" className="w-28 h-28 mb-1" draggable={false} />

      {/* Filename with download button */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-base font-bold text-foreground truncate max-w-[200px]">
          {documentName}
          {extension}
        </span>
        <button
          onClick={handleDownload}
          disabled={isLoading || !signedUrl}
          className="p-1 rounded-md hover:bg-foreground/10 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Download file"
        >
          {isLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-foreground/50 text-base" />
          ) : (
            <i className="fa-solid fa-download text-foreground/50 hover:text-foreground text-base" />
          )}
        </button>
      </div>

      {/* File size */}
      <span className="text-sm text-foreground/50">{formatFileSize(data.size)}</span>
    </div>
  )
}

export default memo(FileNodeComponent)
