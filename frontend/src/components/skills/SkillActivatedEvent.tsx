import type { SkillActivatedItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { SkillTimelinePill } from './SkillTimelinePill'

interface SkillActivatedEventProps {
  item: DeepReadonly<SkillActivatedItem>
}

export function SkillActivatedEvent({ item }: SkillActivatedEventProps) {
  return (
    <SkillTimelinePill
      icon="fa-bolt"
      action="Used skill"
      skillName={item.skillName}
      description={item.skillDescription}
      title={`Used skill /${item.skillName}`}
    />
  )
}
