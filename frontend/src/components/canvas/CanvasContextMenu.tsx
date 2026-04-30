import { memo } from 'react'

type CanvasContextMenuMode = 'pane' | 'selection'

interface CanvasContextMenuProps {
  position: { x: number; y: number }
  mode: CanvasContextMenuMode
  onAddDocument: () => void
  onAddStickyNote: () => void
  onAddTextNode: () => void
  onAddLink?: () => void
  onAddImage?: () => void
  onAddFile?: () => void
  onGroup: () => void
  onCreateSection: () => void
  canGroupSelection: boolean
  onClose: () => void
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
}) {
  return (
    <button
      className="w-full px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground flex items-center gap-2 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <i className={`${icon} text-[12px] w-4 text-center`} />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-xs text-foreground-muted/40">{shortcut}</span>}
    </button>
  )
}

export const CanvasContextMenu = memo(function CanvasContextMenu({
  position,
  mode,
  onAddDocument,
  onAddStickyNote,
  onAddTextNode,
  onAddLink,
  onAddImage,
  onAddFile,
  onGroup,
  onCreateSection,
  canGroupSelection,
  onClose,
}: CanvasContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        onKeyDown={(e) => {
          if (
            mode === 'selection' &&
            canGroupSelection &&
            (e.key === 'g' || e.key === 'G') &&
            (e.metaKey || e.ctrlKey)
          ) {
            e.preventDefault()
            onGroup()
            onClose()
          } else if (e.key === 'Escape') {
            onClose()
          }
        }}
      />
      <div
        className="fixed z-[9999] bg-editor border border-outline rounded-lg shadow-lg min-w-[160px] py-1.5"
        style={{ top: position.y, left: position.x }}
      >
        <div className="px-3 pb-1 text-[11px] font-medium text-foreground-muted">Actions</div>
        {mode === 'pane' && (
          <>
            <MenuItem
              icon="fa-regular fa-file-plus"
              label="Add document"
              onClick={() => {
                onAddDocument()
                onClose()
              }}
            />
            <MenuItem
              icon="fa-regular fa-note-sticky"
              label="Add sticky note"
              onClick={() => {
                onAddStickyNote()
                onClose()
              }}
            />
            <MenuItem
              icon="fa-regular fa-font"
              label="Add text"
              onClick={() => {
                onAddTextNode()
                onClose()
              }}
            />
            {onAddLink && (
              <MenuItem
                icon="fa-solid fa-link"
                label="Add link"
                onClick={() => {
                  onAddLink()
                  onClose()
                }}
              />
            )}
            {onAddImage && (
              <MenuItem
                icon="fa-solid fa-image"
                label="Add image"
                onClick={() => {
                  onAddImage()
                  onClose()
                }}
              />
            )}
            {onAddFile && (
              <MenuItem
                icon="fa-solid fa-file"
                label="Add file"
                onClick={() => {
                  onAddFile()
                  onClose()
                }}
              />
            )}
          </>
        )}
        {mode === 'selection' && (
          <>
            {canGroupSelection && (
              <MenuItem
                icon="fa-regular fa-layer-group"
                label="Group"
                shortcut={`${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'} G`}
                onClick={() => {
                  onGroup()
                  onClose()
                }}
              />
            )}
            <MenuItem
              icon="fa-regular fa-rectangle-list"
              label="Create section"
              onClick={() => {
                onCreateSection()
                onClose()
              }}
            />
          </>
        )}
      </div>
    </>
  )
})
