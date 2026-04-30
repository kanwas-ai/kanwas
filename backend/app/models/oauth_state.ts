import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import OrganizationInvite from '#models/organization_invite'

export default class OAuthState extends BaseModel {
  static table = 'oauth_states'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare stateHash: string

  @column()
  declare inviteId: string | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare consumedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => OrganizationInvite, { foreignKey: 'inviteId' })
  declare invite: BelongsTo<typeof OrganizationInvite>
}
