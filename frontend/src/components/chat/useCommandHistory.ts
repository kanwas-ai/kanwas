import { useState, useCallback, useEffect } from 'react'

const MAX_HISTORY_SIZE = 50
const STORAGE_PREFIX = 'chat-command-history-'

function loadHistory(workspaceId: string): string[] {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveHistory(workspaceId: string, history: string[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, JSON.stringify(history))
  } catch (error) {
    console.warn('Failed to save chat history:', error)
  }
}

interface UseCommandHistoryOptions {
  workspaceId: string
  getCurrentValue: () => string
  onValueChange: (value: string) => void
}

export function useCommandHistory({ workspaceId, getCurrentValue, onValueChange }: UseCommandHistoryOptions) {
  const [history, setHistory] = useState<string[]>(() => loadHistory(workspaceId))
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [draft, setDraft] = useState('')

  // Load history when workspaceId changes
  useEffect(() => {
    setHistory(loadHistory(workspaceId))
    setHistoryIndex(-1)
    setDraft('')
  }, [workspaceId])

  const addToHistory = useCallback(
    (message: string) => {
      setHistory((prev) => {
        const newHistory = [...prev, message]
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift()
        }
        saveHistory(workspaceId, newHistory)
        return newHistory
      })
    },
    [workspaceId]
  )

  const navigateUp = useCallback(() => {
    if (history.length === 0) return

    // Save draft on first navigation
    if (historyIndex === -1) {
      setDraft(getCurrentValue())
    }

    const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
    setHistoryIndex(newIndex)
    onValueChange(history[newIndex])
  }, [history, historyIndex, getCurrentValue, onValueChange])

  const navigateDown = useCallback(() => {
    if (historyIndex === -1) return // Not navigating

    const newIndex = historyIndex + 1

    if (newIndex >= history.length) {
      setHistoryIndex(-1)
      onValueChange(draft)
    } else {
      setHistoryIndex(newIndex)
      onValueChange(history[newIndex])
    }
  }, [history, historyIndex, draft, onValueChange])

  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1)
    setDraft('')
  }, [])

  return {
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    isNavigating: historyIndex !== -1,
  }
}
