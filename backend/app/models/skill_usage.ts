import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Skill from '#models/skill'
import Workspace from '#models/workspace'

export type SkillUsageSource = 'command' | 'agent'

export default class SkillUsage extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: string

  @column()
  declare skillId: string | null

  @column()
  declare skillName: string

  @column()
  declare workspaceId: string

  @column()
  declare conversationId: string

  @column()
  declare source: SkillUsageSource

  @column.dateTime()
  declare invokedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Skill)
  declare skill: BelongsTo<typeof Skill>

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>
}
