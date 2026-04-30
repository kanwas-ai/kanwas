import type { SubagentExecutionItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SubagentExecutionProps {
  item: DeepReadonly<SubagentExecutionItem>
}

const modelConfig: Record<string, { label: string }> = {
  small: { label: 'Small' },
  medium: { label: 'Medium' },
  big: { label: 'Big' },
  haiku: { label: 'Small' },
  sonnet: { label: 'Medium' },
  opus: { label: 'Big' },
}

const agentTypeLabels: Record<string, string> = {
  explore: 'Explorer',
  external: 'External',
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
      {children}
    </a>
  ),
}

export function SubagentExecution({ item }: SubagentExecutionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const model = modelConfig[item.model] || modelConfig.small
  const agentLabel = agentTypeLabels[item.agentType] || item.agentType

  // Running state
  if (item.status === 'running') {
    return (
      <div
        className="rounded-[var(--chat-radius)] p-3 space-y-2 border border-focused-content/50"
        style={{
          background: 'var(--chat-subagent-bg)',
          boxShadow: 'var(--chat-subagent-shadow)',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full text-left hover:opacity-80 cursor-pointer transition-opacity animate-shimmer"
        >
          <i className="fa-solid fa-binoculars w-4 text-center flex-shrink-0 text-focused-content text-[12px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{agentLabel} running</span>
              <span className="text-xs text-foreground-muted opacity-60">{model.label}</span>
            </div>
            <p className="text-sm text-foreground-muted mt-0.5 truncate">{item.taskDescription}</p>
          </div>
          <svg
            className={`w-4 h-4 text-foreground-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200 pt-2 border-t border-outline">
            <div className="text-sm text-foreground-muted leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:bg-canvas [&_code]:px-1 [&_code]:rounded [&_pre]:bg-canvas [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {item.taskObjective}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Completed state
  if (item.status === 'completed') {
    return (
      <div
        className="rounded-[var(--chat-radius)] p-3 space-y-2 border border-focused-content/50"
        style={{
          background: 'var(--chat-subagent-bg)',
          boxShadow: 'var(--chat-subagent-shadow)',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full text-left hover:opacity-80 cursor-pointer transition-opacity"
        >
          <i className="fa-solid fa-binoculars w-4 text-center flex-shrink-0 text-focused-content text-[12px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{agentLabel} completed</span>
              <span className="text-xs text-foreground-muted opacity-60">{model.label}</span>
              {item.iterationCount !== undefined && (
                <span className="text-xs text-foreground-muted opacity-60">
                  {item.iterationCount} {item.iterationCount === 1 ? 'iteration' : 'iterations'}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground-muted mt-0.5 truncate">{item.taskDescription}</p>
          </div>
          <svg
            className={`w-4 h-4 text-foreground-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200 pt-2 border-t border-outline">
            <div className="text-sm text-foreground-muted leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:bg-canvas [&_code]:px-1 [&_code]:rounded [&_pre]:bg-canvas [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {item.taskObjective}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Failed state
  if (item.status === 'failed') {
    return (
      <div
        className="rounded-[var(--chat-radius)] p-3 space-y-2 border border-focused-content/50"
        style={{
          background: 'var(--chat-subagent-bg)',
          boxShadow: 'var(--chat-subagent-shadow)',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full text-left hover:opacity-80 cursor-pointer transition-opacity"
        >
          <i className="fa-solid fa-binoculars w-4 text-center flex-shrink-0 text-focused-content text-[12px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{agentLabel}</span>
              <span className="text-sm font-medium text-status-error">failed</span>
              <span className="text-xs text-foreground-muted opacity-60">{model.label}</span>
            </div>
            <p className="text-sm text-foreground-muted mt-0.5 truncate">{item.taskDescription}</p>
          </div>
          <svg
            className={`w-4 h-4 text-foreground-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200 pt-2 border-t border-outline space-y-2">
            {item.error && <p className="text-sm text-status-error">{item.error}</p>}
            <div className="text-sm text-foreground-muted leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:bg-canvas [&_code]:px-1 [&_code]:rounded [&_pre]:bg-canvas [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {item.taskObjective}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
