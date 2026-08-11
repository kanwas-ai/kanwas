import { memo } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

interface GroupButtonProps {
  onClick: () => void
  isActive: boolean
}

export const GroupButton = memo(function GroupButton({ onClick, isActive }: GroupButtonProps) {
  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={isActive ? onClick : undefined}
            aria-disabled={!isActive}
            className={`canvas-btn w-[36px] h-[36px] rounded-full transition-all duration-200 flex items-center justify-center ${
              isActive ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default opacity-30'
            }`}
          >
            <i className="fa-solid fa-layer-group text-[12px] text-foreground" />
          </button>
        </Tooltip.Trigger>
        {isActive && (
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 pointer-events-none bg-canvas border border-outline rounded px-3 py-1.5 text-sm text-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
              sideOffset={8}
              side="top"
            >
              Group selected
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </Tooltip.Provider>
  )
})
