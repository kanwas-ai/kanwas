import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSnapshot } from 'valtio'
import type { AgentMode } from 'backend/agent'
import { useChat } from '@/providers/chat'
import { useSetAgentMode } from '@/providers/chat/hooks'

type ModeOption = {
  value: AgentMode
  label: string
  icon: string
  description: string
  color: string
  background: string
  border: string
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'thinking',
    label: 'Thinking',
    icon: 'fa-brain',
    description: 'Collaborative mode for strategy, exploration, tradeoffs, and shaping unclear work.',
    color: '#d69600',
    background: 'rgba(232, 163, 0, 0.14)',
    border: 'rgba(232, 163, 0, 0.32)',
  },
  {
    value: 'direct',
    label: 'Direct',
    icon: 'fa-bolt',
    description: 'Execution mode for clear requests, fast answers, edits, summaries, and bounded tasks.',
    color: '#0b6e99',
    background: 'rgba(11, 110, 153, 0.13)',
    border: 'rgba(11, 110, 153, 0.3)',
  },
]

const TOOLTIP_CLASS =
  'z-[70] max-w-[240px] rounded-lg bg-[var(--palette-tooltip)] px-3 py-2 text-xs leading-relaxed text-white shadow-lg'

const DIRECT_MODE_TIP_TEXT = 'Prefer fewer questions? Use Direct for more execution and fewer check-ins.'

export function AgentModeSelector({
  showDirectModeTip = false,
  onDismissDirectModeTip,
}: {
  showDirectModeTip?: boolean
  onDismissDirectModeTip?: () => void
}) {
  const { state } = useChat()
  const snapshot = useSnapshot(state)
  const setAgentMode = useSetAgentMode()
  const activeMode = snapshot.agentMode === 'direct' ? 'direct' : 'thinking'
  const activeOption = MODE_OPTIONS.find((option) => option.value === activeMode) ?? MODE_OPTIONS[0]
  const [directModeTipVisible, setDirectModeTipVisible] = useState(false)
  const onDismissDirectModeTipRef = useRef(onDismissDirectModeTip)
  const dismissedCurrentTipRef = useRef(false)
  const directModeTipVisibleRef = useRef(false)
  const showDirectModeTipRef = useRef(showDirectModeTip)

  useEffect(() => {
    onDismissDirectModeTipRef.current = onDismissDirectModeTip
  }, [onDismissDirectModeTip])

  useEffect(() => {
    showDirectModeTipRef.current = showDirectModeTip
  }, [showDirectModeTip])

  const setDirectModeTipVisibleValue = useCallback((visible: boolean) => {
    directModeTipVisibleRef.current = visible
    setDirectModeTipVisible(visible)
  }, [])

  const dismissDirectModeTip = useCallback(() => {
    if (dismissedCurrentTipRef.current || (!directModeTipVisibleRef.current && !showDirectModeTipRef.current)) return

    dismissedCurrentTipRef.current = true
    setDirectModeTipVisibleValue(false)
    onDismissDirectModeTipRef.current?.()
  }, [setDirectModeTipVisibleValue])

  useEffect(() => {
    if (!showDirectModeTip || activeMode !== 'thinking') {
      setDirectModeTipVisibleValue(false)
      dismissedCurrentTipRef.current = false
      return
    }

    dismissedCurrentTipRef.current = false
    setDirectModeTipVisibleValue(true)

    const timer = setTimeout(() => {
      dismissDirectModeTip()
    }, 5000)

    return () => clearTimeout(timer)
  }, [showDirectModeTip, activeMode, dismissDirectModeTip, setDirectModeTipVisibleValue])

  const handleOpenChange = (open: boolean) => {
    if (open) {
      dismissDirectModeTip()
    }
  }

  const handleSelectMode = (mode: AgentMode) => {
    if (mode !== activeMode) {
      dismissDirectModeTip()
    }
    setAgentMode(mode)
  }

  const directModeTipActive = directModeTipVisible && activeMode === 'thinking'

  return (
    <div className="relative inline-flex">
      {directModeTipActive && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-[70] mb-3 w-[240px] rounded-lg bg-[var(--palette-tooltip)] px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
        >
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-bolt text-[10px] opacity-70" aria-hidden="true" />
            <span>{DIRECT_MODE_TIP_TEXT}</span>
          </div>
          <div className="absolute top-full left-[24px] h-0 w-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[var(--palette-tooltip)]" />
        </div>
      )}

      <DropdownMenu.Root modal={false} onOpenChange={handleOpenChange}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Select agent mode"
            onClick={dismissDirectModeTip}
            className={`inline-flex h-[36px] min-w-[112px] items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer ${directModeTipActive ? 'animate-direct-mode-tip' : ''}`}
            style={{
              color: activeOption.color,
              background: activeOption.background,
              borderColor: activeOption.border,
            }}
          >
            <i className={`fa-solid ${activeOption.icon} text-[12px]`} aria-hidden="true" />
            <span>{activeOption.label}</span>
            <i className="fa-solid fa-chevron-down text-[8px] opacity-70" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-[60] min-w-[190px] rounded-lg border border-chat-pill-border bg-canvas p-1 shadow-lg"
          >
            <Tooltip.Provider delayDuration={250} skipDelayDuration={0}>
              {MODE_OPTIONS.map((option) => {
                const selected = activeMode === option.value

                return (
                  <Tooltip.Root key={option.value}>
                    <Tooltip.Trigger asChild>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-block-hover data-[highlighted]:bg-block-hover"
                        onSelect={() => handleSelectMode(option.value)}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{
                            color: option.color,
                            background: option.background,
                            border: `1px solid ${option.border}`,
                          }}
                        >
                          <i className={`fa-solid ${option.icon} text-[11px]`} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 font-medium text-foreground">{option.label}</span>
                        {selected && <i className="fa-solid fa-check text-[11px] text-foreground-muted" />}
                      </DropdownMenu.Item>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className={TOOLTIP_CLASS} side="right" align="center" sideOffset={10}>
                        {option.description}
                        <Tooltip.Arrow className="fill-[var(--palette-tooltip)]" width={8} height={4} />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                )
              })}
            </Tooltip.Provider>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
