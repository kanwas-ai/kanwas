import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import SkillPreference from '#models/skill_preference'

export default class Skill extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: string | null

  @column()
  declare name: string

  @column()
  declare body: string

  /**
   * Description is stored in metadata JSONB, not as a separate column.
   * This getter provides convenient access.
   */
  get description(): string {
    return (this.metadata?.description as string) ?? ''
  }

  @column()
  declare metadata: Record<string, unknown>

  @column()
  declare isSystem: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => SkillPreference)
  declare preferences: HasMany<typeof SkillPreference>
}
