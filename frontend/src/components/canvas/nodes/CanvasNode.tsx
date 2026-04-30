import { memo } from 'react'
import type { CanvasXyNode, CanvasItem, NodeItem } from 'shared'
import { useWorkspace } from '@/providers/workspace'
import type { WithCanvasData } from '../types'

type CanvasNodeProps = WithCanvasData<CanvasXyNode>

function CanvasNodeComponent({ id, data, selected }: CanvasNodeProps) {
  const { store, setActiveCanvasId } = useWorkspace()
  const { onCanvasSelect } = data

  // Find the canvas item to get its name and count
  const findCanvas = (items: (NodeItem | CanvasItem)[], targetId: string): CanvasItem | null => {
    for (const item of items) {
      if (item.kind === 'canvas' && item.id === targetId) return item
      if (item.kind === 'canvas') {
        const found = findCanvas(item.items, targetId)
        if (found) return found
      }
    }
    return null
  }

  const canvas = store.root ? findCanvas(store.root.items, id) : null
  const documentName = data.documentName || canvas?.name || 'Canvas'
  // Direct children count (matches sidebar behavior) - subfolders count as 1 item
  const itemCount = canvas?.items?.length ?? 0

  const handleDoubleClick = () => {
    // Use onCanvasSelect callback for smooth transitions, fall back to direct navigation
    if (onCanvasSelect) {
      onCanvasSelect(id)
    } else {
      setActiveCanvasId(id)
    }
  }

  return (
    <div
      className={`bg-editor border border-outline box-border cursor-pointer ${selected ? 'node-card-selected' : ''}`}
      style={{
        width: '268px',
        height: '56px',
        borderRadius: '20px',
        padding: '0 20px',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center justify-between h-full">
        {/* Left side: folder icon + name */}
        <div className="flex items-center gap-3">
          <i
            className="fa-solid fa-folder"
            style={{
              fontSize: '16px',
              color: 'color-mix(in srgb, var(--foreground) 30%, transparent)',
            }}
          />
          <span
            className="font-bold"
            style={{
              fontSize: '16px',
              color: 'var(--foreground)',
            }}
          >
            {documentName}
          </span>
        </div>

        {/* Right side: item count */}
        <span
          className="font-medium"
          style={{
            fontSize: '16px',
            color: 'color-mix(in srgb, var(--foreground) 50%, transparent)',
          }}
        >
          {itemCount}
        </span>
      </div>
    </div>
  )
}

export default memo(CanvasNodeComponent)
