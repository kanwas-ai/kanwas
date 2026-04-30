import { useRef, useState, useEffect, useCallback } from 'react'
import { useSnippets, getSelectionHtml } from '@/hooks/useSnippets'
import { useFitNodeInView } from '@/components/canvas/hooks'
import { Bookmark } from 'lucide-react'

interface ChatSelectionSaveProps {
  children: React.ReactNode
  source?: string
  className?: string
}

/**
 * Wraps the chat messages area and shows a floating "Save" button
 * when any text is selected within it (works for all chat components).
 */
export function ChatSelectionSave({ children, source, className }: ChatSelectionSaveProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [saveButtonPos, setSaveButtonPos] = useState<{ top: number; left: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [selectedHtml, setSelectedHtml] = useState('')
  const { saveSnippet } = useSnippets()
  const fitNodeInView = useFitNodeInView()

  const updateSelection = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!text || !containerRef.current || !selection?.rangeCount) {
      setSaveButtonPos(null)
      setSelectedText('')
      setSelectedHtml('')
      return
    }

    const range = selection.getRangeAt(0)
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setSaveButtonPos(null)
      setSelectedText('')
      setSelectedHtml('')
      return
    }

    // Position near the focus point (where the user's mouse ended)
    // by creating a collapsed range at the focus position
    const focusRange = document.createRange()
    focusRange.setStart(selection.focusNode!, selection.focusOffset)
    focusRange.collapse(true)
    const focusRects = focusRange.getClientRects()
    // Fall back to the full range rect if focus gives nothing (e.g. at element boundary)
    const targetRect = focusRects.length > 0 ? focusRects[0] : range.getBoundingClientRect()

    const containerRect = containerRef.current.getBoundingClientRect()
    const scrollParent = containerRef.current.parentElement

    // Clamp to stay within the visible scroll viewport
    const visibleTop = scrollParent ? scrollParent.getBoundingClientRect().top : containerRect.top
    const visibleBottom = scrollParent ? scrollParent.getBoundingClientRect().bottom : containerRect.bottom
    const idealTop = targetRect.top - 36
    const clampedViewportTop = Math.max(Math.min(idealTop, visibleBottom - 40), visibleTop + 4)

    setSaveButtonPos({
      top: clampedViewportTop - containerRect.top,
      left: Math.min(Math.max(targetRect.left - containerRect.left, 40), containerRect.width - 40),
    })
    setSelectedText(text)
    setSelectedHtml(getSelectionHtml(containerRef.current) ?? '')
  }, [])

  const handleMouseUp = useCallback(() => {
    setTimeout(updateSelection, 10)
  }, [updateSelection])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!saveButtonPos) return
      const button = containerRef.current?.querySelector('[data-snippet-button]')
      if (button?.contains(e.target as Node)) return
      setSaveButtonPos(null)
      setSelectedText('')
      setSelectedHtml('')
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [saveButtonPos])

  const handleSaveClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!selectedText) return

      // Prefer HTML if available (preserves formatting), fallback to text
      const nodeId = selectedHtml
        ? saveSnippet({ type: 'html', html: selectedHtml }, source)
        : saveSnippet({ type: 'text', text: selectedText }, source)

      setSaveButtonPos(null)
      setSelectedText('')
      setSelectedHtml('')
      window.getSelection()?.removeAllRanges()

      // Focus the snippets document on the canvas
      if (nodeId) {
        setTimeout(() => fitNodeInView(nodeId), 150)
      }
    },
    [selectedText, selectedHtml, source, saveSnippet, fitNodeInView]
  )

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`} onMouseUp={handleMouseUp}>
      {children}

      {saveButtonPos && (
        <div
          data-snippet-button
          className="absolute z-50 flex flex-col items-center"
          style={{
            top: `${saveButtonPos.top}px`,
            left: `${saveButtonPos.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <button
            onClick={handleSaveClick}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2C2920] dark:bg-sidebar-item-text-active text-white dark:text-[#2C2920] text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer"
            title="Clip to document"
          >
            <Bookmark size={11} className="group-hover:fill-current" />
            Clip
          </button>
          <svg
            width="12"
            height="6"
            viewBox="0 0 12 6"
            className="text-[#2C2920] dark:text-sidebar-item-text-active -mt-px"
          >
            <path d="M0 0L6 6L12 0" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  )
}
