import vine from '@vinejs/vine'
import './custom_types.js'
import { WORKSPACE_ONBOARDING_STATUSES } from '#types/workspace_onboarding'

export const createWorkspaceValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    workspaceId: vine.string().uuid().optional(),
    organizationId: vine.string().uuid().optional(),
  })
)

export const updateWorkspaceValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).optional(),
  })
)

export const WorkspaceSchema = vine.compile(
  vine.object({
    id: vine.string(),
    name: vine.string(),
    organizationId: vine.string(),
    onboardingStatus: vine.enum([...WORKSPACE_ONBOARDING_STATUSES]),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime(),
  })
)
