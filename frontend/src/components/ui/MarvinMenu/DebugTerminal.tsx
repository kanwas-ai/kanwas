import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useDebugBash } from '@/hooks/useDebugBash'
import { ansiToHtml } from '@/lib/ansiToHtml'

interface DebugTerminalProps {
  workspaceId: string
}

export function DebugTerminal({ workspaceId }: DebugTerminalProps) {
  const { lines, isExecuting, currentCwd, history, execute, isCheckingStatus, shutdown } = useDebugBash(workspaceId)
  const [input, setInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  // Focus input on mount and after command execution completes
  useEffect(() => {
    if (!isExecuting) {
      inputRef.current?.focus()
    }
  }, [isExecuting])

  // Shutdown sandbox on unmount (if agent is not running)
  useEffect(() => {
    return () => {
      shutdown()
    }
  }, [shutdown])

  const handleSubmit = async () => {
    if (!input.trim() || isExecuting) return
    const cmd = input.trim()

    setHistoryIndex(-1)
    setInput('')
    await execute(cmd)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault()
      const newIndex = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(newIndex)
      setInput(history[history.length - 1 - newIndex] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1)
        setInput(history[history.length - historyIndex] || '')
      } else {
        setHistoryIndex(-1)
        setInput('')
      }
    }
  }

  const formatCwd = (cwd: string) => {
    if (cwd === '/workspace') return '~'
    if (cwd.startsWith('/workspace/')) return '~/' + cwd.slice(11)
    return cwd
  }

  // Show loading state while checking status
  if (isCheckingStatus) {
    return (
      <div className="flex flex-col h-64 bg-zinc-950 rounded-lg border border-zinc-800 items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-xl text-zinc-500 mb-2"></i>
        <span className="text-zinc-500 text-sm">Checking sandbox status...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-64 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-sm">
      {/* Scrollable output area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1"
        onMouseUp={() => {
          // Only focus input if no text is selected (allows text selection)
          const selection = window.getSelection()
          if (!selection || selection.isCollapsed) {
            inputRef.current?.focus()
          }
        }}
      >
        {lines.length === 0 && (
          <div className="text-zinc-600 text-xs">
            Type commands to execute in the sandbox. A new sandbox will be created if none exists. Type "clear" to
            reset.
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id}>
            {line.type === 'input' && (
              <div className="flex items-start gap-2">
                <span className="text-green-500 shrink-0">{formatCwd(line.cwd || '/workspace')}</span>
                <span className="text-zinc-500">$</span>
                <span className="text-zinc-200">{line.content}</span>
              </div>
            )}
            {line.type === 'output' && (
              <div
                className="text-zinc-300 whitespace-pre-wrap break-all"
                dangerouslySetInnerHTML={{ __html: ansiToHtml(line.content) }}
              />
            )}
            {line.type === 'error' && (
              <div
                className="text-red-400 whitespace-pre-wrap break-all"
                dangerouslySetInnerHTML={{ __html: ansiToHtml(line.content) }}
              />
            )}
          </div>
        ))}
        {isExecuting && <div className="text-zinc-500 animate-pulse">...</div>}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 shrink-0">
        <span className="text-green-500 shrink-0">{formatCwd(currentCwd)}</span>
        <span className="text-zinc-500">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          placeholder={isExecuting ? 'Executing...' : 'Enter command...'}
          className="flex-1 bg-transparent text-zinc-200 outline-none placeholder-zinc-600 min-w-0"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
