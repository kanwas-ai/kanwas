import { useState, useCallback, type ReactNode } from 'react'
import { KeyboardContext, type KeyboardContextValue } from './KeyboardContext'

interface KeyboardProviderProps {
  children: ReactNode
}

export function KeyboardProvider({ children }: KeyboardProviderProps) {
  const [exclusiveHandler, setExclusiveHandlerState] = useState<string | null>(null)

  const setExclusiveHandler = useCallback((id: string | null) => {
    setExclusiveHandlerState(id)
  }, [])

  const isKeyboardAvailable = useCallback(() => {
    return exclusiveHandler === null
  }, [exclusiveHandler])

  const value: KeyboardContextValue = {
    exclusiveHandler,
    setExclusiveHandler,
    isKeyboardAvailable,
  }

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
}
