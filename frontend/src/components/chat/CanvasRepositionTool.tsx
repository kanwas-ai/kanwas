import { useState } from 'react'
import type { RepositionFilesItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useWorkspaceSnapshot } from '@/providers/workspace'
import { resolveWorkspacePath } from '@/lib/workspaceUtils'
import type { CanvasItem } from 'shared'
import { SubagentBadge } from './SubagentBadge'

interface CanvasRepositionToolProps {
  item: DeepReadonly<RepositionFilesItem>
  onNodeSelect?: (nodeId: string, canvasId: string) => void
  streaming?: boolean
}

function getSummary(item: DeepReadonly<RepositionFilesItem>, streaming?: boolean): string {
  const count = item.paths.length

  if (item.status === 'failed') {
    return `Repositioning ${count} file${count === 1 ? '' : 's'} failed`
  }

  if (streaming || item.status === 'executing') {
    return count > 0 ? `Repositioning files... (${count})` : 'Repositioning files...'
  }

  return `Repositioned ${count} file${count === 1 ? '' : 's'}`
}

export function CanvasRepositionTool({ item, onNodeSelect, streaming }: CanvasRepositionToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const snapshot = useWorkspaceSnapshot()
  const canExpand = item.paths.length > 0 || (!!item.error && item.status === 'failed')
  const summary = getSummary(item, streaming)

  return (
    <div className="inline-block max-w-full bg-chat-pill border border-chat-pill-border shadow-chat-pill rounded-[var(--chat-radius)]">
      <button
        type="button"
        onClick={() => canExpand && setIsExpanded((value) => !value)}
        className={`inline-flex items-center gap-2 text-sm text-chat-pill-text px-3 py-1.5 max-w-full text-left transition-opacity ${
          streaming || item.status === 'executing' ? 'animate-shimmer' : ''
        } ${canExpand ? 'hover:opacity-80 cursor-pointer' : ''}`}
        title={summary}
      >
        <i className="fa-solid fa-up-down-left-right w-4 text-center flex-shrink-0 text-[11px] text-chat-pill-icon" />
        <span className={`min-w-0 flex-1 truncate ${item.status === 'failed' ? 'text-status-error' : ''}`}>
          {summary}
        </span>
        {item.agent?.source === 'subagent' && <SubagentBadge />}
        {canExpand && (
          <svg
            className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 pl-9 space-y-2 animate-in fade-in duration-200">
          {item.paths.length > 0 && (
            <div className="space-y-1">
              {item.paths.map((path) => {
                const resolved = snapshot.root ? resolveWorkspacePath(snapshot.root as CanvasItem, path) : null
                const isClickable = resolved && onNodeSelect

                return isClickable ? (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onNodeSelect?.(resolved.nodeId, resolved.canvasId)}
                    className="block max-w-full truncate text-left text-xs text-chat-link hover:underline"
                    title={path}
                  >
                    {path}
                  </button>
                ) : (
                  <div key={path} className="max-w-full truncate text-xs text-chat-pill-text/80" title={path}>
                    {path}
                  </div>
                )
              })}
            </div>
          )}
          {item.status === 'failed' && item.error && <div className="text-xs text-status-error">{item.error}</div>}
        </div>
      )}
    </div>
  )
}
