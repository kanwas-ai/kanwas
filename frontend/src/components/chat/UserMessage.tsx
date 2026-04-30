import type { UserMessageItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { FilePreviewList } from './FilePreviewList'

interface UserMessageProps {
  item: DeepReadonly<UserMessageItem>
  canEdit?: boolean
  isEditing?: boolean
  onEdit?: (item: DeepReadonly<UserMessageItem>) => void
}

export function UserMessage({ item, canEdit = false, isEditing = false, onEdit }: UserMessageProps) {
  return (
    <div className="group/message relative ml-auto w-fit max-w-[70%] min-w-0">
      {canEdit && onEdit ? (
        <div className="absolute inset-y-0 right-full flex items-start pr-2 pt-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="inline-flex items-center gap-1 rounded-full border border-chat-pill-border bg-chat-clear px-2.5 py-1 text-xs font-medium text-foreground-muted shadow-chat-pill opacity-0 translate-x-1 transition-all duration-150 cursor-pointer pointer-events-none group-hover/message:pointer-events-auto group-hover/message:translate-x-0 group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:translate-x-0 group-focus-within/message:opacity-100 hover:border-outline hover:bg-chat-bubble hover:text-foreground focus-visible:pointer-events-auto focus-visible:translate-x-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-chat-pill-border"
            aria-label="Edit message"
            title="Edit message"
          >
            <i className="fa-solid fa-pen-to-square text-[10px]" aria-hidden="true" />
            Edit
          </button>
        </div>
      ) : null}

      <div
        className={`min-w-0 max-w-full text-base text-foreground bg-chat-bubble rounded-[var(--chat-radius)] px-4 py-3 font-medium whitespace-pre-wrap break-words ${isEditing ? 'ring-1 ring-chat-pill-border' : ''}`}
        style={{ lineHeight: '1.6' }}
      >
        {item.message}
        {item.uploadedFiles && item.uploadedFiles.length > 0 && <FilePreviewList files={item.uploadedFiles} />}
      </div>
    </div>
  )
}
