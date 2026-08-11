import { useState } from 'react'
import { InlineInput } from '@/components/ui/InlineInput'
import { useUpdateDocumentName } from '../hooks'
import { showToast } from '@/utils/toast'

interface DocumentNameProps {
  nodeId: string
  documentName: string
  isStatic?: boolean
  extension?: string
  isRenameProtected?: boolean
  onToggleCollapse?: () => void
  collapsed?: boolean
  trailingContent?: React.ReactNode
  containerStyle?: React.CSSProperties
  containerClassName?: string
}

export function DocumentName({
  nodeId,
  documentName,
  isStatic,
  extension,
  isRenameProtected = false,
  onToggleCollapse,
  collapsed,
  trailingContent,
  containerStyle,
  containerClassName,
}: DocumentNameProps) {
  const [isEditing, setIsEditing] = useState(false)
  const updateDocumentName = useUpdateDocumentName()

  const handleRename = (newName: string) => {
    if (isRenameProtected) {
      showToast('Instructions document cannot be renamed', 'info')
      setIsEditing(false)
      return
    }

    if (newName !== documentName && newName.trim()) {
      updateDocumentName(nodeId, newName)
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="mb-1 px-1">
        <InlineInput
          value={documentName || ''}
          onSave={handleRename}
          onCancel={() => setIsEditing(false)}
          placeholder="Document name..."
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 pl-4 pr-1 py-1 ${containerClassName ?? ''}`}
      style={{ maxWidth: 313, ...containerStyle }}
    >
      <div
        className={`group/name min-w-0 flex flex-1 items-center gap-1 text-document-name text-sm font-medium ${
          isStatic || isRenameProtected ? '' : 'cursor-pointer hover:text-foreground transition-colors'
        }`}
        onDoubleClick={isStatic || isRenameProtected ? undefined : () => setIsEditing(true)}
      >
        <span className="truncate">
          {documentName || 'Untitled Document'}
          {extension}
        </span>
        {onToggleCollapse && (
          <button
            className="shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity cursor-pointer text-document-name hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
          >
            <i className={`fa-solid ${collapsed ? 'fa-chevron-right' : 'fa-chevron-down'} text-[12px]`} />
          </button>
        )}
      </div>
      {trailingContent ? <div className="shrink-0">{trailingContent}</div> : null}
    </div>
  )
}
