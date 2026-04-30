import type { Skill } from '@/api/skills'

export type SkillCategory = 'craft' | 'framework' | 'workflow' | 'custom'

export const CATEGORY_CONFIG: Record<SkillCategory, { icon: string; color: string; bg: string }> = {
  craft: { icon: 'fa-pen-fancy', color: 'text-violet-400', bg: 'bg-violet-400/10' },
  framework: { icon: 'fa-diagram-project', color: 'text-sky-400', bg: 'bg-sky-400/10' },
  workflow: { icon: 'fa-arrows-spin', color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  custom: { icon: 'fa-bolt', color: 'text-pink-400', bg: 'bg-pink-400/10' },
}

export const CATEGORY_META: Record<SkillCategory, { label: string; icon: string; color: string; description: string }> =
  {
    craft: {
      label: 'Craft',
      icon: 'fa-pen-fancy',
      color: 'text-violet-400',
      description: 'Create documents and artifacts',
    },
    framework: {
      label: 'Framework',
      icon: 'fa-diagram-project',
      color: 'text-sky-400',
      description: 'Apply structured thinking methods',
    },
    workflow: {
      label: 'Workflow',
      icon: 'fa-arrows-spin',
      color: 'text-cyan-400',
      description: 'Multi-step orchestrated processes',
    },
    custom: {
      label: 'Custom',
      icon: 'fa-bolt',
      color: 'text-pink-400',
      description: 'Your personal skills',
    },
  }

export const CATEGORY_ORDER: SkillCategory[] = ['craft', 'framework', 'workflow', 'custom']

export function getSkillCategory(skill: Skill): SkillCategory {
  if (!skill.isSystem) return 'custom'
  const category = skill.metadata?.category as string | undefined
  if (category && category in CATEGORY_CONFIG) return category as SkillCategory
  return 'custom'
}
