interface SectionHeaderAction {
  icon: string
  title: string
  onClick: () => void
}

interface SectionHeaderProps {
  title: string
  onAdd?: () => void
  addTitle?: string
  onClick?: () => void
  actions?: SectionHeaderAction[]
}

export function SectionHeader({ title, onAdd, addTitle, onClick, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1.5 select-none">
      <span
        className={`text-[11px] font-semibold tracking-wider text-foreground-muted uppercase ${onClick ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`}
        onClick={onClick}
      >
        {title}
      </span>
      <div className="flex items-center gap-0.5">
        {actions?.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className="group w-5 h-5 flex items-center justify-center cursor-pointer"
            title={action.title}
          >
            <i
              className={`${action.icon} text-[11px] text-sidebar-icon group-hover:text-foreground transition-colors`}
            />
          </button>
        ))}
        {onAdd && (
          <button
            onClick={onAdd}
            className="group w-5 h-5 flex items-center justify-center cursor-pointer"
            title={addTitle}
          >
            <i className="fa-solid fa-plus text-[11px] text-sidebar-icon group-hover:text-foreground transition-colors" />
          </button>
        )}
      </div>
    </div>
  )
}
