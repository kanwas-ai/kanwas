'use client'

import { useInViewportOnce } from '@/hooks/useInViewportOnce'
import { type CSSProperties } from 'react'

interface FlashOpacityTextProps {
  children: string
  finalOpacity: number
}

export function FlashOpacityText({ children, finalOpacity }: FlashOpacityTextProps) {
  const { ref, hasEntered } = useInViewportOnce(0.5)
  const text = children

  // Total animation spread: 0.4s across all characters
  const totalDuration = 0.4
  const delayPerChar = text.length > 0 ? totalDuration / text.length : 0

  return (
    <span ref={ref}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="flash-letter"
          style={
            {
              opacity: hasEntered ? finalOpacity : 1,
              transition: hasEntered ? `opacity 0.15s ease-out ${i * delayPerChar}s` : undefined,
            } as CSSProperties
          }
        >
          {char}
        </span>
      ))}
    </span>
  )
}
