import vine from '@vinejs/vine'
import './custom_types.js'
import { personNameValidator } from '#validators/person_name'

export const createOrganizationInviteValidator = vine.compile(
  vine.object({
    inviteeName: personNameValidator().optional(),
    roleToGrant: vine.enum(['admin', 'member'] as const).optional(),
    expiresInDays: vine.number().positive().max(365).optional(),
  })
)

export const acceptOrganizationInviteValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
  })
)

export const previewOrganizationInviteValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
  })
)

export const OrganizationInviteSchema = vine.compile(
  vine.object({
    id: vine.string(),
    organizationId: vine.string(),
    inviteeName: vine.string(),
    roleToGrant: vine.enum(['admin', 'member'] as const),
    expiresAt: vine.luxonDateTime(),
    revokedAt: vine.luxonDateTime().nullable(),
    consumedAt: vine.luxonDateTime().nullable(),
    consumedByUserId: vine.string().nullable(),
    createdBy: vine.string(),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime(),
  })
)

export const OrganizationInvitePreviewSchema = vine.compile(
  vine.object({
    organizationName: vine.string(),
    inviteeName: vine.string(),
    roleToGrant: vine.enum(['admin', 'member'] as const),
    expiresAt: vine.luxonDateTime(),
  })
)
