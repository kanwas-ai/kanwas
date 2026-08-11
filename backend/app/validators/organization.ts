import vine from '@vinejs/vine'
import './custom_types.js'

export const updateOrganizationValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
  })
)

const UsagePeriodSnapshotSchema = vine.object({
  usedCents: vine.number(),
  limitCents: vine.number(),
  remainingCents: vine.number(),
  percent: vine.number(),
  periodStartUtc: vine.luxonDateTime(),
  periodEndUtc: vine.luxonDateTime(),
})

export const OrganizationSchema = vine.compile(
  vine.object({
    id: vine.string(),
    name: vine.string(),
    role: vine.enum(['admin', 'member'] as const),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime(),
    weeklyLimitCents: vine.number(),
    monthlyLimitCents: vine.number(),
    billingCycleAnchorUtc: vine.luxonDateTime(),
    usage: vine.object({
      weekly: UsagePeriodSnapshotSchema,
      monthly: UsagePeriodSnapshotSchema,
      isOutOfUsage: vine.boolean(),
      lastSyncedAt: vine.luxonDateTime().nullable(),
    }),
  })
)

export const MyOrganizationSchema = vine.compile(
  vine.object({
    id: vine.string(),
    name: vine.string(),
    role: vine.enum(['admin', 'member'] as const),
    defaultWorkspaceId: vine.string().nullable(),
  })
)
