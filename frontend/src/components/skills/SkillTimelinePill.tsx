interface SkillTimelinePillProps {
  icon: string
  action: string
  skillName: string
  description: string
  title: string
}

export function SkillTimelinePill({ icon, action, skillName, description, title }: SkillTimelinePillProps) {
  return (
    <div
      className="inline-block max-w-full overflow-hidden rounded-[var(--chat-radius)] border border-chat-pill-border bg-chat-pill px-3 py-2 text-left shadow-chat-pill"
      title={title}
    >
      <div className="flex max-w-full items-start gap-2">
        <i className={`fa-solid ${icon} mt-[3px] w-4 flex-shrink-0 text-center text-[11px] text-chat-pill-icon`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap text-sm text-chat-pill-text">
            <span className="shrink-0">{action}</span>
            <code className="min-w-0 truncate font-mono text-xs font-semibold text-chat-link">/{skillName}</code>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-chat-pill-text/75">{description}</p>
        </div>
      </div>
    </div>
  )
}
