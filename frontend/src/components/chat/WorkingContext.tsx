import type { WorkingContextItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'

interface WorkingContextProps {
  item: DeepReadonly<WorkingContextItem>
  onCanvasSelect?: (canvasId: string) => void
}

export function WorkingContext({ item, onCanvasSelect }: WorkingContextProps) {
  // Prefer canvasPath (human-readable), fall back to canvasId (UUID), default to /workspace/
  const displayPath = item.canvasPath || (item.canvasId ? `canvas ${item.canvasId}` : '/workspace/')
  const isClickable = item.canvasId && onCanvasSelect

  const handleClick = () => {
    if (item.canvasId && onCanvasSelect) {
      onCanvasSelect(item.canvasId)
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-foreground-muted">
      <i className="fa-solid fa-sliders flex-shrink-0 text-chat-pill-icon"></i>
      <span className="min-w-0 break-words">
        Setting context to{' '}
        {isClickable ? (
          <button onClick={handleClick} className="hover:underline cursor-pointer">
            {displayPath}
          </button>
        ) : (
          displayPath
        )}
      </span>
    </div>
  )
}
