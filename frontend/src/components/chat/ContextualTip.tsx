import { useEffect, useRef, useState } from 'react'
import { openConnectionsModal } from '@/store/useUIStore'

// ---------------------------------------------------------------------------
// connect_tools — pill button rendered above chat input
// ---------------------------------------------------------------------------

export function ConnectToolsTip({
  connector,
  label: agentLabel,
  onDismiss,
}: {
  connector?: string
  label?: string
  onDismiss: () => void
}) {
  const label = agentLabel || (connector ? `Connect ${connector}` : 'Connect your tools')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={`px-4 pb-2 transition-all duration-300 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <div className="flex items-center gap-1 rounded-lg bg-[var(--palette-tooltip)] text-white pl-2 pr-1 py-1 shadow-lg">
        <button
          type="button"
          onClick={() => {
            openConnectionsModal({ initialSearch: connector, fromTip: true })
          }}
          className="group flex items-center gap-3 flex-1 min-w-0 cursor-pointer py-1"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 shrink-0 animate-amber-pulse">
            <i className="fa-solid fa-plug text-[11px] text-white/70" />
          </span>
          <span className="text-[13px] font-medium text-white/80 group-hover:text-white transition-colors">
            {label}
          </span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          title="Dismiss"
        >
          <i className="fa-solid fa-xmark text-[11px]" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// voice_input — tooltip with arrow pointing at mic button + pulse ring
// ---------------------------------------------------------------------------

export function VoiceInputTip({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const tipRef = useRef<HTMLDivElement>(null)

  // Fade in on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      ref={tipRef}
      className={`absolute bottom-full right-0 mb-3 z-20 transition-all duration-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
    >
      <div className="relative bg-[var(--palette-tooltip)] text-white rounded-lg px-3 py-2 text-xs shadow-lg whitespace-nowrap">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-microphone text-[10px] opacity-70" />
          <span>Try voice input</span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-white/50 hover:text-white transition-colors cursor-pointer ml-1"
          >
            <i className="fa-solid fa-xmark text-[9px]" />
          </button>
        </div>
        {/* Arrow pointing down — aligned with mic button center (18px = half of 36px button) */}
        <div className="absolute top-full right-[13px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[var(--palette-tooltip)]" />
      </div>
    </div>
  )
}
