import type { ComposioSchemaItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { useState } from 'react'
import { ComposioTimelinePill } from './ComposioTimelinePill'
import { composioDetailCardClassName } from './composioTimelineUtils'

interface ComposioSchemaProps {
  item: DeepReadonly<ComposioSchemaItem>
}

export function ComposioSchema({ item }: ComposioSchemaProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasToolSlugs = item.toolSlugs && item.toolSlugs.length > 0
  const isFetching = item.status === 'fetching'

  // Failed state
  if (item.status === 'failed') {
    return (
      <ComposioTimelinePill
        icon={<i className="fa-solid fa-person-running" />}
        title={`Fetch schemas for ${item.toolSlugs.length} tool${item.toolSlugs.length !== 1 ? 's' : ''} failed${
          item.error ? `: ${item.error}` : ''
        }`}
        label={
          <>
            Fetch schemas for {item.toolSlugs.length} tool{item.toolSlugs.length !== 1 ? 's' : ''}
            <span className="font-medium text-status-error"> failed</span>
          </>
        }
        subtitle={item.error ? <span className="text-status-error">{item.error}</span> : undefined}
      />
    )
  }

  // Fetching or completed
  const schemaCount = item.schemasFound ?? item.toolSlugs.length
  const canExpand = !isFetching && hasToolSlugs

  return (
    <ComposioTimelinePill
      icon={<i className="fa-solid fa-person-running" />}
      title={`${isFetching ? 'Fetching' : 'Fetched'} ${schemaCount} ${schemaCount === 1 ? 'schema' : 'schemas'}`}
      active={isFetching}
      canExpand={canExpand}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      label={
        <>
          {isFetching ? 'Fetching' : 'Fetched'} tool schemas
          <span className="text-chat-pill-text/70">
            {' '}
            ({schemaCount} {schemaCount === 1 ? 'schema' : 'schemas'})
          </span>
        </>
      }
    >
      {hasToolSlugs &&
        item.toolSlugs.map((slug, index) => (
          <div key={index} className={composioDetailCardClassName}>
            <code className="block truncate font-mono text-xs font-semibold text-chat-link">{slug}</code>
          </div>
        ))}
    </ComposioTimelinePill>
  )
}
