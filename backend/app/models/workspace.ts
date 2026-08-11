import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Organization from '#models/organization'
import type { WorkspaceOnboardingStatus } from '#types/workspace_onboarding'

export default class Workspace extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare organizationId: string

  @column()
  declare isEmbedTemplate: boolean

  @column()
  declare onboardingStatus: WorkspaceOnboardingStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @manyToMany(() => User, {
    pivotTable: 'workspace_users',
    pivotTimestamps: true,
  })
  declare owners: ManyToMany<typeof User>

  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>
}
