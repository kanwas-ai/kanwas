import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Organization from '#models/organization'

export const ORGANIZATION_USAGE_PERIOD_TYPES = ['weekly_7d', 'monthly_billing_cycle'] as const

export type OrganizationUsagePeriodType = (typeof ORGANIZATION_USAGE_PERIOD_TYPES)[number]

export default class OrganizationUsagePeriod extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare organizationId: string

  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>

  @column()
  declare periodType: OrganizationUsagePeriodType

  @column.dateTime()
  declare periodStartUtc: DateTime

  @column.dateTime()
  declare periodEndUtc: DateTime

  @column()
  declare totalCostCents: number

  @column.dateTime()
  declare syncedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
