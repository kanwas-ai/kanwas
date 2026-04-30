import type { ComposioBashItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState, useEffect } from 'react'
import { ComposioTimelinePill } from './ComposioTimelinePill'
import { composioCodeBlockClassName, formatComposioDuration } from './composioTimelineUtils'

interface ComposioBashProps {
  item: DeepReadonly<ComposioBashItem>
}

function getLastOutputLine(...outputs: Array<string | undefined>): string | null {
  for (const output of outputs) {
    if (!output) continue

    const lines = output.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (line) return line
    }
  }

  return null
}

export function ComposioBash({ item }: ComposioBashProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const isLongCommand = item.command.length > 60
  const hasOutput = (item.stdout && item.stdout.trim().length > 0) || (item.stderr && item.stderr.trim().length > 0)
  const isExecuting = item.status === 'executing'

  // Track elapsed time for executing status
  useEffect(() => {
    if (isExecuting) {
      const intervalId = setInterval(() => {
        setElapsedTime(Date.now() - item.timestamp)
      }, 1000)
      return () => clearInterval(intervalId)
    }
  }, [isExecuting, item.timestamp])

  const canExpand = isLongCommand || hasOutput || (item.status === 'failed' && !!item.error)
  const elapsedLabel = isExecuting && elapsedTime > 0 ? formatComposioDuration(elapsedTime) : ''
  const previewLine = !isExpanded
    ? item.status === 'failed'
      ? getLastOutputLine(item.stderr, item.stdout)
      : getLastOutputLine(item.stdout, item.stderr)
    : null
  const verb = isExecuting ? 'Running' : item.status === 'failed' ? 'Run' : 'Ran'
  const title = `${verb} remote command: ${item.command}${item.status === 'failed' ? ' failed' : ''}${
    item.error ? `: ${item.error}` : ''
  }${elapsedLabel ? ` (${elapsedLabel})` : ''}`

  return (
    <ComposioTimelinePill
      icon={<i className="fa-solid fa-terminal" />}
      title={title}
      active={isExecuting}
      canExpand={!isExecuting && canExpand}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      label={
        <>
          {verb} <code className="font-mono text-xs font-semibold text-chat-link">{item.command}</code>
          {item.status === 'failed' && <span className="font-medium text-status-error"> failed</span>}
          <span className="text-xs text-chat-pill-text/60"> (remote)</span>
        </>
      }
      subtitle={
        item.status === 'failed' && item.error ? (
          <span className="text-status-error">{item.error}</span>
        ) : previewLine ? (
          previewLine
        ) : elapsedLabel ? (
          elapsedLabel
        ) : undefined
      }
    >
      {isLongCommand && <pre className={composioCodeBlockClassName}>{item.command}</pre>}
      {item.stdout && item.stdout.trim() && <pre className={composioCodeBlockClassName}>{item.stdout}</pre>}
      {item.stderr && item.stderr.trim() && (
        <pre className={`${composioCodeBlockClassName} text-yellow-600 dark:text-yellow-400`}>{item.stderr}</pre>
      )}
      {item.status === 'failed' && item.error && (
        <div className="rounded-lg border border-status-error/20 bg-chat-background/70 px-3 py-2 text-xs text-status-error">
          {item.error}
        </div>
      )}
    </ComposioTimelinePill>
  )
}
