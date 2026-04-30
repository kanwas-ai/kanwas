import type { Skill } from '@/api/skills'
import { CATEGORY_CONFIG, getSkillCategory } from './skill-utils'

interface SkillCardProps {
  skill: Skill
  isToggling: boolean
  onToggle: (enabled: boolean) => void
  onSelect: () => void
  compact?: boolean
}

export function SkillCard({ skill, isToggling, onToggle, onSelect, compact }: SkillCardProps) {
  const category = getSkillCategory(skill)
  const config = CATEGORY_CONFIG[category]

  return (
    <div
      className={`
        group flex items-start gap-3 p-3 rounded-lg border border-transparent
        hover:bg-block-highlight/40 hover:border-outline/50
        transition-all duration-150 cursor-pointer
        ${!skill.enabled ? 'opacity-50' : ''}
      `}
      onClick={onSelect}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <i className={`fa-solid ${config.icon} ${config.color} text-sm`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">{skill.name}</span>
          {!skill.isSystem && (
            <span className="text-[12px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
              Custom
            </span>
          )}
        </div>
        {!compact && (
          <p className="text-xs text-foreground-muted mt-0.5 line-clamp-2 leading-relaxed">{skill.description}</p>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle(!skill.enabled)
        }}
        disabled={isToggling}
        className={`
          relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0
          ${skill.enabled ? 'bg-status-success' : 'bg-foreground-muted/30'}
          ${isToggling ? 'opacity-50' : ''}
        `}
        aria-label={skill.enabled ? 'Disable skill' : 'Enable skill'}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
            ${skill.enabled ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  )
}
