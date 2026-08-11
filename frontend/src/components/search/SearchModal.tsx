import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWorkspaceSearch, type SearchResult } from '@/hooks/useWorkspaceSearch'
import type { CanvasItem, WorkspaceContentStore } from 'shared'
import * as Y from 'yjs'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  root: CanvasItem | null
  yDoc: Y.Doc | null
  contentStore: WorkspaceContentStore | null
  onSelect: (result: SearchResult, query: string) => void
  activeCanvasId?: string | null
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// Skeleton loader component
function SkeletonItem({ showContent = false }: { showContent?: boolean }) {
  return (
    <div className="px-3 py-1.5 flex items-start gap-2.5 animate-pulse">
      <div className="w-[18px] h-[18px] bg-foreground/5 rounded mt-px" />
      <div className="flex-1 min-w-0">
        <div className="h-[18px] bg-foreground/5 rounded w-3/4" />
        {showContent && <div className="h-3 bg-foreground/5 rounded w-full mt-1" />}
      </div>
    </div>
  )
}

export function SearchModal({ isOpen, onClose, root, yDoc, contentStore, onSelect, activeCanvasId }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce search query for smooth typing
  const debouncedQuery = useDebounce(query, 200)
  const isSearching = query !== debouncedQuery

  const { search, getAllItems } = useWorkspaceSearch(root, yDoc, contentStore, isOpen)

  // Get results based on debounced query
  const results = useMemo(
    () => (debouncedQuery.trim() ? search(debouncedQuery) : getAllItems()),
    [debouncedQuery, search, getAllItems]
  )

  const { displayResults, regularResults, nameMatches, contentMatches } = useMemo(() => {
    const names = results.filter((r) => r.matchType === 'name')
    const content = results.filter((r) => r.matchType === 'content')

    const flat = !debouncedQuery ? results : [...names, ...content]

    return {
      displayResults: flat,
      regularResults: results,
      nameMatches: names,
      contentMatches: content,
    }
  }, [results, debouncedQuery])

  // Lookup: result id -> index in flat displayResults list
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    displayResults.forEach((r, i) => map.set(r.id, i))
    return map
  }, [displayResults])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [debouncedQuery])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      // Small delay to ensure modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && displayResults.length > 0) {
      const selectedElement = listRef.current.querySelector('[data-selected="true"]') as HTMLElement
      selectedElement?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, displayResults.length])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelect(result, query)
      onClose()
    },
    [onSelect, onClose, query]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (displayResults.length > 0) {
            setSelectedIndex((prev) => Math.min(prev + 1, displayResults.length - 1))
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (displayResults.length > 0) {
            setSelectedIndex((prev) => Math.max(prev - 1, 0))
          }
          break
        case 'Enter':
          e.preventDefault()
          if (displayResults.length > 0 && displayResults[selectedIndex]) {
            handleSelect(displayResults[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [displayResults, selectedIndex, handleSelect, onClose]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Modal - fixed height */}
      <div
        className="relative w-full max-w-[600px] bg-editor border border-outline/30 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-outline/50">
          <svg
            className="w-4 h-4 text-foreground/40 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="flex-1 bg-transparent text-foreground placeholder:text-foreground/40 outline-none text-[15px]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-foreground/5 rounded text-foreground/40 hover:text-foreground/60 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Results - fixed height container */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto">
          {!root || !yDoc || !contentStore ? (
            // Workspace not loaded yet
            <div className="py-1.5">
              <div className="px-3 py-1 text-[11px] text-foreground-muted/70 font-medium">Loading...</div>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </div>
          ) : isSearching && query.trim() ? (
            // Show skeleton while searching
            <div className="py-1.5">
              <div className="px-3 py-1 text-[11px] text-foreground-muted/70 font-medium">Searching...</div>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem showContent />
              <SkeletonItem showContent />
              <SkeletonItem />
            </div>
          ) : results.length === 0 ? (
            <div className="h-full flex items-center justify-center text-foreground/30 text-sm py-8">
              {debouncedQuery ? 'No results found' : 'Type to search...'}
            </div>
          ) : !debouncedQuery ? (
            // No query - show recent items
            <div className="py-1.5">
              {regularResults.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[11px] text-foreground-muted/70 font-medium">Recent</div>
                  {regularResults.map((result) => {
                    const index = indexById.get(result.id) ?? -1
                    return (
                      <SearchResultItem
                        key={result.id}
                        result={result}
                        isSelected={index === selectedIndex}
                        isCurrentCanvas={result.canvasId === activeCanvasId}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      />
                    )
                  })}
                </>
              )}
            </div>
          ) : (
            // With query - group by match type
            <div className="py-1.5">
              {nameMatches.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[11px] text-foreground-muted/70 font-medium">Best matches</div>
                  {nameMatches.map((result) => {
                    const index = indexById.get(result.id) ?? -1
                    return (
                      <SearchResultItem
                        key={result.id}
                        result={result}
                        isSelected={index === selectedIndex}
                        isCurrentCanvas={result.canvasId === activeCanvasId}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        query={debouncedQuery}
                      />
                    )
                  })}
                </>
              )}
              {contentMatches.length > 0 && (
                <>
                  <div
                    className={`px-3 py-1 text-[11px] text-foreground-muted/70 font-medium ${nameMatches.length > 0 ? 'mt-1.5 border-t border-outline/50 pt-2' : ''}`}
                  >
                    In content
                  </div>
                  {contentMatches.map((result) => {
                    const index = indexById.get(result.id) ?? -1
                    return (
                      <SearchResultItem
                        key={result.id}
                        result={result}
                        isSelected={index === selectedIndex}
                        isCurrentCanvas={result.canvasId === activeCanvasId}
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        query={debouncedQuery}
                        showContent
                      />
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-outline/50 text-[11px] text-foreground/40 flex gap-3">
          <span>
            <kbd className="px-1 py-0.5 bg-foreground/5 rounded text-[12px] font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-foreground/5 rounded text-[12px] font-mono">↵</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-foreground/5 rounded text-[12px] font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

function SearchResultItem({
  result,
  isSelected,
  isCurrentCanvas,
  onClick,
  onMouseEnter,
  query,
  showContent,
}: {
  result: SearchResult
  isSelected: boolean
  isCurrentCanvas?: boolean
  onClick: () => void
  onMouseEnter: () => void
  query?: string
  showContent?: boolean
}) {
  // Get icon based on type
  const icon =
    result.type === 'canvas' ? (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    ) : (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    )

  // Expand match to whole word boundaries (only for queries >= 3 chars)
  const expandToWord = (text: string, start: number, end: number, queryLen: number) => {
    // Only expand to word for longer queries - short queries highlight exact match
    if (queryLen < 3) return { start, end }
    const wordChars = /[\w-]/
    let wordStart = start
    let wordEnd = end
    while (wordStart > 0 && wordChars.test(text[wordStart - 1])) wordStart--
    while (wordEnd < text.length && wordChars.test(text[wordEnd])) wordEnd++
    return { start: wordStart, end: wordEnd }
  }

  // Highlight matching text in name - expand to whole words for longer queries
  const highlightedName = useMemo(() => {
    if (!query) return result.name

    const nameLower = result.name.toLowerCase()
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)

    // Find all match positions, expand to word boundaries for longer queries
    const matches: { start: number; end: number }[] = []
    for (const word of queryWords) {
      let searchStart = 0
      while (true) {
        const index = nameLower.indexOf(word, searchStart)
        if (index === -1) break
        matches.push(expandToWord(result.name, index, index + word.length, word.length))
        searchStart = index + 1
      }
    }

    if (matches.length === 0) return result.name

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start)
    const merged: { start: number; end: number }[] = []
    for (const match of matches) {
      if (merged.length === 0 || match.start > merged[merged.length - 1].end) {
        merged.push(match)
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end)
      }
    }

    // Build highlighted string
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    for (const match of merged) {
      if (match.start > lastEnd) {
        parts.push(result.name.slice(lastEnd, match.start))
      }
      parts.push(
        <span key={match.start} className="font-semibold text-foreground">
          {result.name.slice(match.start, match.end)}
        </span>
      )
      lastEnd = match.end
    }
    if (lastEnd < result.name.length) {
      parts.push(result.name.slice(lastEnd))
    }

    return parts
  }, [result.name, query])

  // For content matches, extract snippet with highlighted matches
  // Tries to show complete sentences for better readability
  const contentSnippet = useMemo(() => {
    if (!showContent || !query || !result.content) return null

    // Preserve newlines for line detection, normalize other whitespace
    const content = result.content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\{[^}]*\}/g, '') // Remove curly brace content
      .replace(/[─━│┃┌┐└┘├┤┬┴┼╋═║╔╗╚╝╠╣╦╩╬-]{3,}/g, ' ') // Remove table borders/lines
      .replace(/[│|]{2,}/g, ' ') // Remove repeated pipes
      .replace(/[ \t]+/g, ' ') // Collapse spaces/tabs but keep newlines
      .replace(/\n+/g, '\n') // Collapse multiple newlines
      .trim()

    const contentLower = content.toLowerCase()
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1)

    // Find the best match position - where query words appear closest together
    // For each occurrence of each word, score by how many other query words are nearby
    let bestMatchIndex = -1
    let bestScore = -1

    for (const word of queryWords) {
      let searchStart = 0
      while (true) {
        const index = contentLower.indexOf(word, searchStart)
        if (index === -1) break

        // Score this position by counting nearby query words within 100 chars
        let score = 0
        const windowStart = Math.max(0, index - 50)
        const windowEnd = Math.min(content.length, index + 100)
        const window = contentLower.slice(windowStart, windowEnd)

        for (const otherWord of queryWords) {
          if (window.includes(otherWord)) {
            score++
          }
        }

        // Prefer positions where words appear together (higher score)
        if (score > bestScore) {
          bestScore = score
          bestMatchIndex = index
        }

        searchStart = index + 1
      }
    }

    if (bestMatchIndex === -1) return null

    // Find start of line where match occurs (look for newline)
    const beforeMatch = content.slice(0, bestMatchIndex)
    const lastNewline = beforeMatch.lastIndexOf('\n')
    let snippetStart = lastNewline !== -1 ? lastNewline + 1 : 0

    // If line start is too far back (>80 chars), find a closer boundary
    if (bestMatchIndex - snippetStart > 80) {
      const nearWindow = content.slice(bestMatchIndex - 60, bestMatchIndex)
      const spaceIdx = nearWindow.indexOf(' ')
      if (spaceIdx !== -1) {
        snippetStart = bestMatchIndex - 60 + spaceIdx + 1
      } else {
        snippetStart = bestMatchIndex - 60
      }
    }

    // End snippet at newline or after ~120 chars
    const afterMatch = content.slice(bestMatchIndex)
    const nextNewline = afterMatch.indexOf('\n')
    let snippetEnd: number

    if (nextNewline !== -1 && nextNewline < 150) {
      // End at newline if within reasonable distance
      snippetEnd = bestMatchIndex + nextNewline
    } else {
      // No newline, end at ~120 chars at word boundary
      snippetEnd = Math.min(content.length, bestMatchIndex + 120)
      if (snippetEnd < content.length) {
        const endSpace = content.lastIndexOf(' ', snippetEnd)
        if (endSpace > bestMatchIndex + 50) {
          snippetEnd = endSpace
        }
      }
    }

    // Get snippet and normalize for display (replace newlines with spaces)
    const snippet = content.slice(snippetStart, snippetEnd).replace(/\n/g, ' ').trim()
    const snippetLower = snippet.toLowerCase()

    // Find all matches within snippet
    const matches: { start: number; end: number }[] = []
    for (const word of queryWords) {
      let searchStart = 0
      while (true) {
        const index = snippetLower.indexOf(word, searchStart)
        if (index === -1) break
        // Expand to whole word for longer queries
        matches.push(expandToWord(snippet, index, index + word.length, word.length))
        searchStart = index + 1
      }
    }

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start)
    const merged: { start: number; end: number }[] = []
    for (const match of matches) {
      if (merged.length === 0 || match.start > merged[merged.length - 1].end) {
        merged.push(match)
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end)
      }
    }

    // Build highlighted content (no leading "...", only trailing if cut off)
    const parts: React.ReactNode[] = []

    let lastEnd = 0
    for (const match of merged) {
      if (match.start > lastEnd) {
        parts.push(snippet.slice(lastEnd, match.start))
      }
      parts.push(
        <span key={match.start} className="font-medium text-foreground">
          {snippet.slice(match.start, match.end)}
        </span>
      )
      lastEnd = match.end
    }
    if (lastEnd < snippet.length) {
      parts.push(snippet.slice(lastEnd))
    }
    if (snippetEnd < content.length) parts.push('...')

    return parts
  }, [showContent, result.content, query])

  return (
    <button
      data-selected={isSelected}
      className={`w-full px-3 py-1.5 flex items-start gap-2.5 text-left rounded-md mx-1 transition-colors duration-75 ${
        isSelected ? 'bg-foreground/[0.04]' : 'hover:bg-foreground/[0.02]'
      }`}
      style={{ width: 'calc(100% - 8px)' }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div
        className={`mt-0.5 flex-shrink-0 transition-colors duration-75 ${isSelected ? 'text-foreground/70' : 'text-foreground/40'}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        {/* Title row with location inline */}
        <div className="flex items-center gap-1.5 text-[14px]">
          <span
            className={`truncate transition-colors duration-75 ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}
          >
            {highlightedName}
          </span>
          {result.type === 'node' && result.canvasName && <span className="text-foreground/30 flex-shrink-0">—</span>}
          {result.type === 'node' && result.canvasName && (
            <span className="text-foreground/40 truncate text-[13px]">{result.canvasName}</span>
          )}
          {isCurrentCanvas && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[12px] bg-foreground/5 text-foreground/50 rounded font-medium ml-auto">
              Current
            </span>
          )}
        </div>

        {/* Content snippet row */}
        {contentSnippet && (
          <div className="text-[13px] text-foreground/40 mt-0.5 line-clamp-2 leading-relaxed">{contentSnippet}</div>
        )}
      </div>
    </button>
  )
}
