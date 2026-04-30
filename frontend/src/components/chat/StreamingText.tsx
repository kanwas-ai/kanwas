import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useInterruptAgent } from '@/providers/chat/hooks'
import { useKeyboardShortcut } from '@/providers/keyboard'

interface StreamingTextProps {
  text: string
  type: 'progress' | 'thinking'
}

export function StreamingText({ text }: StreamingTextProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const interruptAgent = useInterruptAgent()

  const handleInterrupt = useCallback(async () => {
    if (isStopping) return
    setIsStopping(true)
    await interruptAgent()
  }, [isStopping, interruptAgent])

  // ESC key to interrupt
  useKeyboardShortcut('Escape', handleInterrupt)

  if (isStopping) {
    return (
      <div className="text-foreground-muted flex items-center gap-2 text-sm select-none">
        <div className="w-2 h-2 rounded-full animate-pulse bg-foreground-muted"></div>
        <span>Stopping...</span>
      </div>
    )
  }

  return (
    <div className="group relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="text-foreground-muted text-sm leading-relaxed">
        {text}
        <span className="inline-block w-0.5 h-4 bg-foreground-muted ml-0.5 animate-pulse align-middle" />
      </div>
      {isHovered && (
        <button
          onClick={handleInterrupt}
          className="absolute -right-6 top-0 p-1 text-foreground-muted hover:text-foreground transition-colors"
          title="Click or press ESC to stop"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
