import { useState } from 'react'
import { useMarvinConfig } from '@/hooks/useMarvinConfig'
import { useWorkspace } from '@/providers/workspace'
import { DebugTerminal } from './DebugTerminal'
import type { ConversationItem } from 'backend/agent'

interface MarvinMenuProps {
  isOpen: boolean
  onClose: () => void
  timeline?: ConversationItem[]
}

function formatTimelineAsText(timeline: ConversationItem[]): string {
  const lines: string[] = []
  lines.push('='.repeat(60))
  lines.push('CHAT HISTORY')
  lines.push('='.repeat(60))
  lines.push('')

  for (const item of timeline) {
    const date = new Date(item.timestamp)
    const time = date.toLocaleTimeString()

    switch (item.type) {
      case 'user_message':
        lines.push(`[${time}] USER:`)
        lines.push(item.message)
        lines.push('')
        break

      case 'chat':
        lines.push(`[${time}] ASSISTANT:`)
        lines.push(item.message)
        lines.push('')
        break

      case 'thinking':
        lines.push(`[${time}] THINKING:`)
        lines.push(item.thought)
        lines.push('')
        break

      case 'error':
        lines.push(`[${time}] ERROR:`)
        lines.push(`${item.error.code}: ${item.error.message}`)
        lines.push('')
        break

      case 'bash':
        lines.push(`[${time}] BASH (${item.status}):`)
        lines.push(`$ ${item.command}`)
        if (item.exitCode !== undefined) lines.push(`Exit code: ${item.exitCode}`)
        lines.push('')
        break

      case 'text_editor':
        lines.push(`[${time}] TEXT_EDITOR (${item.command}):`)
        lines.push(`Path: ${item.path}`)
        lines.push('')
        break

      case 'reposition_files':
        lines.push(`[${time}] REPOSITION_FILES (${item.status}):`)
        for (const path of item.paths) {
          lines.push(`Path: ${path}`)
        }
        if (item.error) {
          lines.push(`Error: ${item.error}`)
        }
        lines.push('')
        break

      case 'web_search':
        lines.push(`[${time}] WEB_SEARCH:`)
        lines.push(`Query: ${item.searchQueries?.join(', ') ?? 'N/A'}`)
        if (item.results) {
          for (const r of item.results) {
            lines.push(`  - ${r.title}: ${r.url}`)
          }
        }
        lines.push('')
        break

      case 'execution_completed':
        lines.push(`[${time}] EXECUTION_COMPLETED:`)
        lines.push(item.summary)
        lines.push('')
        break

      case 'suggested_tasks':
        lines.push(`[${time}] SUGGESTED_TASKS (${item.scope}, ${item.status}):`)
        if (item.tasks.length === 0) {
          lines.push(item.error ?? 'No suggested tasks')
        } else {
          for (const task of item.tasks) {
            lines.push(`  - ${task.emoji} ${task.headline}`)
          }
        }
        if (item.error) {
          lines.push(`Error: ${item.error}`)
        }
        lines.push('')
        break
    }
  }

  return lines.join('\n')
}

export function MarvinMenu({ isOpen, onClose, timeline = [] }: MarvinMenuProps) {
  const { workspaceId } = useWorkspace()
  const { config, defaults, isLoading, error } = useMarvinConfig(workspaceId, isOpen)
  const [activeTab, setActiveTab] = useState<'settings' | 'terminal' | 'history'>('terminal')
  const hasSettings = Object.keys(config ?? {}).length > 0 || Object.keys(defaults ?? {}).length > 0

  const openHistoryInNewTab = () => {
    const text = formatTimelineAsText(timeline)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-700 w-full max-w-lg max-h-[80vh] flex flex-col animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Marvin Mode</h2>
            <p className="text-xs text-zinc-500 font-mono mt-1">// Debug tools and settings</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer text-zinc-400 hover:text-zinc-100"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-purple-400 border-b-2 border-purple-400 -mb-px'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <i className="fa-solid fa-gear mr-2"></i>
            Settings
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'terminal'
                ? 'text-purple-400 border-b-2 border-purple-400 -mb-px'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <i className="fa-solid fa-terminal mr-2"></i>
            Terminal
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-purple-400 border-b-2 border-purple-400 -mb-px'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left mr-2"></i>
            History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'settings' && (
            <div className="flex min-h-64 flex-col justify-center">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-zinc-500"></i>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <i className="fa-solid fa-bug text-4xl mb-3"></i>
                  <p>Failed to load config</p>
                </div>
              ) : hasSettings ? (
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-4 text-sm text-zinc-400">
                  Marvin settings are available, but this menu has not been updated to edit them yet.
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <i className="fa-solid fa-sliders text-4xl text-zinc-600 mb-3"></i>
                  <p className="text-sm font-medium text-zinc-200">No Marvin settings available</p>
                  <p className="mt-2 max-w-sm text-sm text-zinc-500">
                    System prompt editing has been removed. Marvin terminal access and session history remain available
                    here.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'terminal' && <DebugTerminal workspaceId={workspaceId} />}

          {activeTab === 'history' && (
            <div className="flex flex-col h-64">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-zinc-100 font-medium">Chat History</div>
                  <div className="text-sm text-zinc-500">{timeline.length} items in current session</div>
                </div>
                <button
                  onClick={openHistoryInNewTab}
                  disabled={timeline.length === 0}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      timeline.length === 0
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-500 cursor-pointer'
                    }
                  `}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  Open in new tab
                </button>
              </div>
              <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 p-3 overflow-y-auto font-mono text-xs text-zinc-400">
                {timeline.length === 0 ? (
                  <div className="text-zinc-600">No chat history in current session.</div>
                ) : (
                  <pre className="whitespace-pre-wrap">{formatTimelineAsText(timeline)}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer with workspace ID */}
        <div className="px-6 py-4 border-t border-zinc-700 bg-zinc-800/30 rounded-b-2xl">
          <p className="text-xs text-zinc-600 text-center font-mono">&gt; marvin @ {workspaceId.slice(0, 8)}...</p>
        </div>
      </div>
    </div>
  )
}
