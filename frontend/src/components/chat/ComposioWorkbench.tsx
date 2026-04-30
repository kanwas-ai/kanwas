import type { ComposioWorkbenchItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState, useEffect } from 'react'
import { ComposioTimelinePill } from './ComposioTimelinePill'
import { composioCodeBlockClassName, formatComposioDuration } from './composioTimelineUtils'

interface ComposioWorkbenchProps {
  item: DeepReadonly<ComposioWorkbenchItem>
}

export function ComposioWorkbench({ item }: ComposioWorkbenchProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const isExecuting = item.status === 'executing'
  const description = item.thought || item.codeDescription || 'Running code'

  // Track elapsed time for executing status
  useEffect(() => {
    if (isExecuting) {
      const intervalId = setInterval(() => {
        setElapsedTime(Date.now() - item.timestamp)
      }, 1000)
      return () => clearInterval(intervalId)
    }
  }, [isExecuting, item.timestamp])

  // Failed state
  if (item.status === 'failed') {
    return (
      <ComposioTimelinePill
        icon={<i className="fa-solid fa-person-running" />}
        title={`Remote code failed${item.error ? `: ${item.error}` : ''}`}
        canExpand={!!item.code}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        label={
          <>
            Remote code
            <span className="font-medium text-status-error"> failed</span>
          </>
        }
        subtitle={item.error ? <span className="text-status-error">{item.error}</span> : description}
      >
        {item.code && <pre className={composioCodeBlockClassName}>{item.code}</pre>}
      </ComposioTimelinePill>
    )
  }

  // Executing or completed
  const canExpand = !isExecuting && item.code
  const elapsedLabel = isExecuting && elapsedTime > 0 ? formatComposioDuration(elapsedTime) : ''

  return (
    <ComposioTimelinePill
      icon={<i className="fa-solid fa-person-running" />}
      title={`${isExecuting ? 'Running' : 'Ran'} remote code: ${description}${elapsedLabel ? ` (${elapsedLabel})` : ''}`}
      active={isExecuting}
      canExpand={!!canExpand}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      label={`${isExecuting ? 'Running' : 'Ran'} remote code`}
      subtitle={
        <>
          {description}
          {elapsedLabel && <span> · {elapsedLabel}</span>}
        </>
      }
    >
      {item.code && <pre className={composioCodeBlockClassName}>{item.code}</pre>}
    </ComposioTimelinePill>
  )
}
