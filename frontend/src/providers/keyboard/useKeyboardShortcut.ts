import { useEffect, useRef } from 'react'
import { useKeyboard } from './KeyboardContext'

type KeyboardShortcutHandler = (event: KeyboardEvent) => void

interface ShortcutOptions {
  /** Skip if target is an input/textarea/contenteditable (default: true) */
  skipInputs?: boolean
  /** Require Ctrl key (or Cmd on Mac) */
  ctrl?: boolean
  /** Require Shift key */
  shift?: boolean
  /** Require Alt key (Option on Mac) */
  alt?: boolean
  /** Call preventDefault on the event (default: false) */
  preventDefault?: boolean
}

/**
 * Register a global keyboard shortcut that automatically respects exclusive mode.
 * When another component has exclusive keyboard control, this shortcut won't fire.
 *
 * @param key - The key to listen for (e.g., 'Escape', 'Enter', 'k')
 * @param handler - Callback when key is pressed
 * @param options - Additional options
 *
 * @example
 * useKeyboardShortcut('Escape', () => setOpen(false))
 * useKeyboardShortcut('k', openSearch, { ctrl: true })
 * useKeyboardShortcut(' ', openSearch, { ctrl: true }) // Ctrl+Space
 */
export function useKeyboardShortcut(key: string, handler: KeyboardShortcutHandler, options: ShortcutOptions = {}) {
  const { skipInputs = true, ctrl = false, shift = false, alt = false, preventDefault = false } = options
  const { isKeyboardAvailable } = useKeyboard()

  // Use ref to always call latest handler without re-subscribing
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if keyboard is locked by exclusive handler
      if (!isKeyboardAvailable()) return

      // Skip if focused on input elements (optional)
      if (skipInputs) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }

      // Check modifier keys (ctrl is strictly Ctrl, not Cmd on Mac)
      if (ctrl && !e.ctrlKey) return
      if (!ctrl && e.ctrlKey) return
      if (e.metaKey) return // Always ignore Cmd to avoid conflicts with native shortcuts
      if (shift && !e.shiftKey) return
      if (!shift && e.shiftKey) return
      if (alt && !e.altKey) return
      if (!alt && e.altKey) return

      // Check if key matches
      if (e.key === key) {
        if (preventDefault) e.preventDefault()
        handlerRef.current(e)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key, isKeyboardAvailable, skipInputs, ctrl, shift, alt, preventDefault])
}
