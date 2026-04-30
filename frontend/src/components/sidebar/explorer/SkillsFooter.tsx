interface SkillsFooterProps {
  enabledCount: number
  totalCount: number
  onClick: () => void
}

export function SkillsFooter({ enabledCount, totalCount, onClick }: SkillsFooterProps) {
  return (
    <button onClick={onClick} className="group w-full cursor-pointer select-none">
      <div className="flex items-center font-medium h-[32px] mx-1 px-3 rounded-[var(--chat-radius)] hover:bg-sidebar-hover transition-colors">
        <i
          className="fa-solid fa-bolt icon-gradient shrink-0 text-[11px]"
          style={{ '--icon-color': 'var(--sidebar-icon)' } as React.CSSProperties}
        />
        <span className="text-sm text-sidebar-item-text ml-1.5">Skills</span>
        <span className="ml-auto text-xs text-sidebar-icon">
          {enabledCount}/{totalCount}
        </span>
      </div>
    </button>
  )
}
