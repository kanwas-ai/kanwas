import { useMemo } from 'react'
import thinkingAnimation from '@/assets/thinking-animation.png'

// Random PM-themed thinking phrases
const thinkingPhrases = [
  'Thinking...',
  'Brainstorming...',
  'Analyzing...',
  'Connecting dots...',
  'Mapping it out...',
  'Processing...',
]

interface ThinkingLoaderProps {
  isResponding?: boolean
}

export function ThinkingLoader({ isResponding }: ThinkingLoaderProps) {
  // Pick a random phrase on mount (stable for component lifetime)
  const thinkingPhrase = useMemo(() => thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)], [])

  const displayText = isResponding ? 'Responding...' : thinkingPhrase

  return (
    <div className="text-foreground-muted flex items-center gap-2 text-sm select-none">
      <img src={thinkingAnimation} alt="Thinking" className="w-12 h-12 -ml-3" />
      <span className="font-medium -ml-4">{displayText}</span>
    </div>
  )
}
