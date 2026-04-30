import { useState, useEffect } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { UploadedFile } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useSignedUrl } from '@/hooks/useSignedUrl'

interface FilePreviewProps {
  file: File | DeepReadonly<UploadedFile>
  onRemove?: () => void
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  const isUploadedFile = (file: File | DeepReadonly<UploadedFile>): file is DeepReadonly<UploadedFile> => {
    return !(file instanceof File)
  }

  const mimeType = isUploadedFile(file) ? file.mimeType : file.type
  const filename = isUploadedFile(file) ? file.filename : file.name
  const isImage = mimeType.startsWith('image/') && !imageError

  // Fetch signed URL for uploaded files that don't have a URL
  const shouldFetchSignedUrl = isUploadedFile(file)
  const isTemp = isUploadedFile(file) && file.id.startsWith('temp_')
  const { data: signedUrl } = useSignedUrl(shouldFetchSignedUrl && !isTemp ? file.path : undefined)

  useEffect(() => {
    if (!isImage) return

    if (!isUploadedFile(file)) {
      // Only create blob URL for File objects
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      if (signedUrl) {
        setPreviewUrl(signedUrl)
      }
    }
  }, [file, isImage, signedUrl])

  const getFileExtension = (): string => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE'
  }

  const getDocumentColor = (extension: string): string => {
    const colors: Record<string, string> = {
      PDF: 'bg-red-500',
      DOC: 'bg-blue-500',
      DOCX: 'bg-blue-500',
      XLS: 'bg-green-600',
      XLSX: 'bg-green-600',
      PPT: 'bg-orange-500',
      PPTX: 'bg-orange-500',
      TXT: 'bg-gray-500',
      MD: 'bg-purple-500',
      JSON: 'bg-yellow-600',
      XML: 'bg-yellow-600',
      HTML: 'bg-indigo-500',
      CSS: 'bg-pink-500',
      JS: 'bg-yellow-500',
      TS: 'bg-blue-600',
      MP4: 'bg-purple-600',
      WEBM: 'bg-purple-600',
      MP3: 'bg-pink-600',
      WAV: 'bg-pink-600',
    }
    return colors[extension] || 'bg-gray-600'
  }

  const extension = getFileExtension()
  const documentColor = getDocumentColor(extension)

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="group/file relative flex-shrink-0 pt-2 pr-2">
            <div className="w-[48px] h-[48px] rounded-lg border border-outline overflow-hidden bg-canvas">
              {isImage && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={filename}
                  className="w-full h-full object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className={`w-full h-full flex items-center justify-center ${documentColor}`}>
                  <span className="text-white font-semibold text-xs">{extension}</span>
                </div>
              )}
            </div>

            {/* Remove button - show on hover only */}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute top-0 right-0 w-5 h-5 bg-secondary-button-active-background text-secondary-button-active-foreground rounded-full items-center justify-center hover:opacity-80 transition-opacity border border-outline shadow-sm z-10 hidden group-hover/file:flex cursor-pointer"
                title={`Remove ${filename}`}
              >
                <i className="fa-solid fa-xmark text-[12px]"></i>
              </button>
            )}
          </div>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-secondary-button-active-background text-secondary-button-active-foreground text-xs px-2 py-1 rounded shadow-lg max-w-xs z-50"
            sideOffset={2}
          >
            {filename}
            <Tooltip.Arrow className="fill-secondary-button-active-background" width={8} height={4} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
