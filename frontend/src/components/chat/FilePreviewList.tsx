import { FilePreview } from './FilePreview'
import type { UploadedFile } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'

interface FilePreviewListProps {
  files: File[] | DeepReadonly<UploadedFile[]>
  onRemoveFile?: (index: number) => void
}

export function FilePreviewList({ files, onRemoveFile }: FilePreviewListProps) {
  if (files.length === 0) return null

  const isUploadedFiles = files.length > 0 && 'url' in files[0]

  return (
    <div className="flex overflow-x-auto gap-1.5 scrollbar-hide">
      {files.map((file, index) => (
        <div
          key={isUploadedFiles ? (file as DeepReadonly<UploadedFile>).id : `${(file as File).name}-${index}`}
          className="shrink-0"
        >
          <FilePreview file={file} onRemove={onRemoveFile ? () => onRemoveFile(index) : undefined} />
        </div>
      ))}
    </div>
  )
}
