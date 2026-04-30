import { memo } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

interface CollapseAllButtonProps {
  onClick: () => void
  isActive: boolean
  action: 'collapse' | 'expand'
}

export const CollapseAllButton = memo(function CollapseAllButton({
  onClick,
  isActive,
  action,
}: CollapseAllButtonProps) {
  const icon = action === 'collapse' ? 'fa-arrows-to-line' : 'fa-arrows-from-line'
  const tooltipText = action === 'collapse' ? 'Collapse selected' : 'Expand selected'

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={isActive ? onClick : undefined}
            className={`canvas-btn w-[36px] h-[36px] rounded-full transition-all duration-200 flex items-center justify-center ${
              isActive ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default opacity-30'
            }`}
          >
            <i className={`fa-solid ${icon} text-[12px] text-foreground`} />
          </button>
        </Tooltip.Trigger>
        {isActive && (
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 pointer-events-none bg-canvas border border-outline rounded px-3 py-1.5 text-sm text-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
              sideOffset={8}
              side="top"
            >
              {tooltipText}
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </Tooltip.Provider>
  )
})
