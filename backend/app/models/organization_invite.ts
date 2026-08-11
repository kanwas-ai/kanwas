import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Organization from '#models/organization'
import User from '#models/user'
import type { OrganizationRole } from '#models/organization_membership'

export default class OrganizationInvite extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare organizationId: string

  @column()
  declare tokenHash: string

  @column()
  declare createdBy: string

  @column()
  declare roleToGrant: OrganizationRole

  @column()
  declare inviteeName: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column.dateTime()
  declare consumedAt: DateTime | null

  @column()
  declare consumedByUserId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'consumedByUserId' })
  declare consumedBy: BelongsTo<typeof User>
}
