import { tuyau } from '@/api/client'
import type { Entities, Lists } from '@/api/client'

type ApiError = { error?: string; message?: string }

function toError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.error) return new Error(apiError.error)
    if (apiError.message) return new Error(apiError.message)
  }

  return new Error(fallbackMessage)
}

export type Organization = Entities['Organization']
export type OrganizationMember = Lists['OrganizationMember'][number]

export interface MyOrganization {
  id: string
  name: string
  role: 'admin' | 'member'
  defaultWorkspaceId: string | null
}
export type RemoveOrganizationMemberErrorCode =
  | 'SELF_REMOVAL_FORBIDDEN'
  | 'LAST_ADMIN_REMOVAL_BLOCKED'
  | 'MEMBER_NOT_FOUND'

export class RemoveOrganizationMemberError extends Error {
  code?: RemoveOrganizationMemberErrorCode

  constructor(message: string, code?: RemoveOrganizationMemberErrorCode) {
    super(message)
    this.name = 'RemoveOrganizationMemberError'
    this.code = code
  }
}

export const listMyOrganizations = async (): Promise<MyOrganization[]> => {
  const response = await tuyau.me.organizations.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load teams')
  }

  return (response.data as MyOrganization[]) ?? []
}

export const getOrganization = async (workspaceId: string): Promise<Organization> => {
  const response = await tuyau.workspaces({ id: workspaceId }).organization.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load team')
  }

  return response.data as Organization
}

export const updateOrganization = async (workspaceId: string, body: { name: string }): Promise<Organization> => {
  const response = await tuyau.workspaces({ id: workspaceId }).organization.$patch(body)
  if (response.error) {
    throw toError(response.error, 'Failed to update team')
  }

  return response.data as Organization
}

export const listOrganizationMembers = async (workspaceId: string): Promise<OrganizationMember[]> => {
  const response = await tuyau.workspaces({ id: workspaceId }).members.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load team members')
  }

  return (response.data as OrganizationMember[]) ?? []
}

export const updateOrganizationMemberRole = async (
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<OrganizationMember> => {
  const response = await tuyau.workspaces({ id: workspaceId }).members({ userId }).role.$patch({ role })
  if (response.error) {
    throw toError(response.error, 'Failed to update member role')
  }

  return response.data as OrganizationMember
}

export const removeOrganizationMember = async (
  workspaceId: string,
  userId: string
): Promise<{ removedUserId: string }> => {
  const response = await tuyau.workspaces({ id: workspaceId }).members({ userId }).$delete()
  if (response.error) {
    const payload = response.error as { code?: RemoveOrganizationMemberErrorCode; error?: string; message?: string }
    const message = payload.error || payload.message || 'Failed to remove member'
    throw new RemoveOrganizationMemberError(message, payload.code)
  }

  return response.data as { removedUserId: string }
}
