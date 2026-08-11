import { memo } from 'react'

interface GroupContextMenuProps {
  position: { x: number; y: number }
  onGroup: () => void
  onClose: () => void
}

export const GroupContextMenu = memo(function GroupContextMenu({ position, onGroup, onClose }: GroupContextMenuProps) {
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
          if ((e.key === 'g' || e.key === 'G') && e.metaKey) {
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
        <button
          className="w-full px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground flex items-center gap-2 transition-colors cursor-pointer"
          onClick={() => {
            onGroup()
            onClose()
          }}
        >
          <i className="fa-regular fa-layer-group text-[12px] w-4 text-center" />
          <span className="flex-1 text-left">Group</span>
          <span className="text-xs text-foreground-muted/40">⌘ G</span>
        </button>
      </div>
    </>
  )
})
