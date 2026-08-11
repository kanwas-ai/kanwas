interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  position: 'left' | 'right' | 'top' | 'bottom'
  isResizing: boolean
  resizeRef: React.RefObject<HTMLDivElement | null>
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
}

export function ResizeHandle({
  direction,
  position,
  isResizing,
  resizeRef,
  onMouseDown,
  onDoubleClick,
}: ResizeHandleProps) {
  const isHorizontal = direction === 'horizontal'

  // Center hit area on the border, extending both directions
  const positionClasses = {
    left: '-left-3',
    right: '-right-3',
    top: '-top-3 left-0 right-0',
    bottom: '-bottom-3 left-0 right-0',
  }

  const hitAreaClasses = isHorizontal ? 'h-full w-6' : 'h-6'
  const cursorClass = isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'
  const flexAlignment = isHorizontal ? 'flex items-center justify-center' : 'flex items-start'
  const barSizeClasses = isHorizontal ? 'h-full' : 'w-full'
  const barVisibilityClasses = isHorizontal
    ? isResizing
      ? 'w-1 opacity-100'
      : 'w-0 group-hover:w-1 group-hover:opacity-100 opacity-0'
    : isResizing
      ? 'h-1 opacity-100'
      : 'h-0 group-hover:h-1 group-hover:opacity-100 opacity-0'

  return (
    <div
      ref={resizeRef}
      className={`group absolute ${positionClasses[position]} ${hitAreaClasses} ${cursorClass} ${flexAlignment} z-[50]`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize, double-click to toggle"
    >
      <div className={`${barSizeClasses} bg-[var(--sidebar-edge-border)] transition-all ${barVisibilityClasses}`} />
    </div>
  )
}
