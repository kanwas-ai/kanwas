import { useEffect, useState } from 'react'

const DEFAULT_PULSE_FADE_MS = 260

export function useActivityPulsePresence(active: boolean, fadeMs = DEFAULT_PULSE_FADE_MS) {
  const [isVisible, setIsVisible] = useState(active)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    let frameId: number | null = null
    let timeoutId: number | null = null

    if (active) {
      setIsVisible(true)
      frameId = window.requestAnimationFrame(() => {
        setIsActive(true)
      })
    } else {
      setIsActive(false)
      timeoutId = window.setTimeout(() => {
        setIsVisible(false)
      }, fadeMs)
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [active, fadeMs])

  return {
    isVisible,
    isActive,
  }
}
