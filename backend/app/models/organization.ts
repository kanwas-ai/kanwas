import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import OrganizationMembership from '#models/organization_membership'
import OrganizationInvite from '#models/organization_invite'
import OrganizationUsagePeriod from '#models/organization_usage_period'

export default class Organization extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare weeklyLimitCents: number

  @column()
  declare monthlyLimitCents: number

  @column.dateTime()
  declare billingCycleAnchorUtc: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Workspace)
  declare workspaces: HasMany<typeof Workspace>

  @hasMany(() => OrganizationMembership)
  declare memberships: HasMany<typeof OrganizationMembership>

  @hasMany(() => OrganizationInvite)
  declare invites: HasMany<typeof OrganizationInvite>

  @hasMany(() => OrganizationUsagePeriod)
  declare usagePeriods: HasMany<typeof OrganizationUsagePeriod>
}
