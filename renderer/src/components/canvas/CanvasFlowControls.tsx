import type { CanvasItem } from 'shared'
import { AddNodeButton } from './AddNodeButton'
import { CollapseAllButton } from './CollapseAllButton'
import { GroupButton } from './GroupButton'
import { FocusModeButton } from './FocusModeButton'

interface CanvasFlowControlsProps {
  mutableCanvas: CanvasItem
  focusMode: boolean
  isFocusModeAvailable: boolean
  canGroupSelection: boolean
  isCollapseButtonActive: boolean
  collapseAction: 'collapse' | 'expand'
  onHoveredSectionChange: (sectionId: string | null) => void
  onSectionContentChange: (sectionId: string) => void
  onToggleFocusMode: () => void
  onCreateGroup: () => void
  onToggleSelectedNodes: () => void
}

export function CanvasFlowControls({
  mutableCanvas,
  focusMode,
  isFocusModeAvailable,
  canGroupSelection,
  isCollapseButtonActive,
  collapseAction,
  onHoveredSectionChange,
  onSectionContentChange,
  onToggleFocusMode,
  onCreateGroup,
  onToggleSelectedNodes,
}: CanvasFlowControlsProps) {
  return (
    <>
      {!focusMode && (
        <AddNodeButton
          canvas={mutableCanvas}
          onHoveredSectionChange={onHoveredSectionChange}
          onSectionContentChange={onSectionContentChange}
        />
      )}
      <div
        className="absolute bottom-[18px] flex gap-2"
        style={{
          right: 'calc(var(--sidebar-width, 0px) + 16px)',
          zIndex: focusMode ? 30 : 10,
        }}
      >
        <FocusModeButton onClick={onToggleFocusMode} isActive={isFocusModeAvailable} />
        {!focusMode && (
          <>
            <GroupButton onClick={onCreateGroup} isActive={canGroupSelection} />
            <CollapseAllButton
              onClick={onToggleSelectedNodes}
              isActive={isCollapseButtonActive}
              action={collapseAction}
            />
          </>
        )}
      </div>
    </>
  )
}
