import { createContext, useContext } from 'react'

export interface KeyboardContextValue {
  /** The ID of the component that has exclusive keyboard control, or null if none */
  exclusiveHandler: string | null
  /** Claim exclusive keyboard control */
  setExclusiveHandler: (id: string | null) => void
  /** Check if keyboard is available (no exclusive handler active) */
  isKeyboardAvailable: () => boolean
}

export const KeyboardContext = createContext<KeyboardContextValue | undefined>(undefined)

export function useKeyboard() {
  const context = useContext(KeyboardContext)
  if (context === undefined) {
    throw new Error('useKeyboard must be used within a KeyboardProvider')
  }
  return context
}
