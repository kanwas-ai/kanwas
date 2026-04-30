import vine from '@vinejs/vine'
import './custom_types.js'

export const updateOrganizationMemberRoleValidator = vine.compile(
  vine.object({
    role: vine.enum(['admin', 'member'] as const),
  })
)

export const OrganizationMemberSchema = vine.compile(
  vine.object({
    id: vine.string(),
    organizationId: vine.string(),
    userId: vine.string(),
    role: vine.enum(['admin', 'member'] as const),
    name: vine.string(),
    email: vine.string().email(),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime(),
  })
)
