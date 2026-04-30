import { memo } from 'react'
import { COLLAPSED_NODE_LAYOUT, NODE_NAME_HEIGHT } from 'shared/constants'
import type { CommonNodeData } from '../types'
import { DocumentName } from './DocumentName'

type CollapsedCardData = CommonNodeData & {
  emoji?: string
  summary?: string
  originalType?: string
}

interface CollapsedCardNodeProps {
  id: string
  selected?: boolean
  data: CollapsedCardData
}

function SkeletonBar({ width, height = 10 }: { width: string; height?: number }) {
  return <div className="rounded-full animate-skeleton" style={{ width, height: `${height}px` }} />
}

export default memo(function CollapsedCardNode({ id, selected, data }: CollapsedCardNodeProps) {
  const { documentName, emoji, summary, onExpandNode } = data
  const isLoading = summary == null
  const cardHeight = COLLAPSED_NODE_LAYOUT.HEIGHT - NODE_NAME_HEIGHT

  return (
    <div
      className="group/collapsed"
      style={{ width: `${COLLAPSED_NODE_LAYOUT.WIDTH}px`, height: `${COLLAPSED_NODE_LAYOUT.HEIGHT}px` }}
    >
      <DocumentName
        nodeId={id}
        documentName={documentName || 'Untitled'}
        isStatic
        onToggleCollapse={() => onExpandNode?.(id)}
        collapsed
        containerStyle={{ width: COLLAPSED_NODE_LAYOUT.WIDTH, maxWidth: COLLAPSED_NODE_LAYOUT.WIDTH }}
      />
      <div
        className={`bg-editor border border-outline box-border relative cursor-pointer ${
          selected ? 'node-card-selected' : ''
        }`}
        style={{
          width: `${COLLAPSED_NODE_LAYOUT.WIDTH}px`,
          height: `${cardHeight}px`,
          borderRadius: '20px',
          overflow: 'hidden',
        }}
        onDoubleClick={() => onExpandNode?.(id)}
      >
        <div className="flex flex-row items-center h-full gap-3" style={{ padding: '16px 18px' }}>
          <div className="text-[28px] leading-none shrink-0">{emoji || '📝'}</div>
          <div className="flex flex-col min-w-0 flex-1" style={{ gap: '2px' }}>
            {isLoading ? (
              <div className="flex flex-col" style={{ gap: '8px' }}>
                <SkeletonBar width="70%" height={14} />
                <div className="flex flex-col" style={{ gap: '2px' }}>
                  <SkeletonBar width="90%" height={10} />
                  <SkeletonBar width="55%" height={10} />
                </div>
              </div>
            ) : (
              <>
                <div className="font-bold truncate text-foreground" style={{ fontSize: '18px', lineHeight: '24px' }}>
                  {documentName || 'Untitled'}
                </div>
                {summary && (
                  <div
                    className="text-foreground-muted line-clamp-2 font-medium"
                    style={{ fontSize: '14px', lineHeight: '18px' }}
                  >
                    {summary}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
