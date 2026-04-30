import type { SkillCreatedItem } from 'backend/agent'
import type { DeepReadonly } from 'ts-essentials'
import { SkillTimelinePill } from './SkillTimelinePill'

interface SkillCreatedEventProps {
  item: DeepReadonly<SkillCreatedItem>
}

export function SkillCreatedEvent({ item }: SkillCreatedEventProps) {
  return (
    <SkillTimelinePill
      icon="fa-plus"
      action="Created skill"
      skillName={item.skillName}
      description={item.skillDescription}
      title={`Created skill /${item.skillName}`}
    />
  )
}
