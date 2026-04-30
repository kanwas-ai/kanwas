import { tuyau } from '@/api/client'
import type { Lists } from '@/api/client'

type ApiError = { error?: string; message?: string }

function toError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.error) return new Error(apiError.error)
    if (apiError.message) return new Error(apiError.message)
  }

  return new Error(fallbackMessage)
}

export type OrganizationInvite = Lists['OrganizationInvite'][number]

export interface CreatedOrganizationInvite {
  invite: OrganizationInvite
  token: string
}

export interface AcceptedOrganizationInvite {
  organizationId: string
  workspaceId: string
  role: 'admin' | 'member'
}

export interface OrganizationInvitePreview {
  organizationName: string
  inviteeName: string
  roleToGrant: 'admin' | 'member'
  expiresAt: Date
}

export const listOrganizationInvites = async (workspaceId: string): Promise<OrganizationInvite[]> => {
  const response = await tuyau.workspaces({ id: workspaceId }).invites.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load organization invites')
  }

  return (response.data as OrganizationInvite[]) ?? []
}

export const createOrganizationInvite = async (
  workspaceId: string,
  body: { inviteeName?: string; roleToGrant?: 'admin' | 'member'; expiresInDays?: number }
): Promise<CreatedOrganizationInvite> => {
  const response = await tuyau.workspaces({ id: workspaceId }).invites.$post(body)
  if (response.error) {
    throw toError(response.error, 'Failed to create invite link')
  }

  return response.data as CreatedOrganizationInvite
}

export const revokeOrganizationInvite = async (workspaceId: string, inviteId: string): Promise<OrganizationInvite> => {
  const response = await tuyau.workspaces({ id: workspaceId }).invites({ inviteId }).revoke.$post()
  if (response.error) {
    throw toError(response.error, 'Failed to revoke invite link')
  }

  return (response.data as { invite: OrganizationInvite }).invite
}

export const acceptOrganizationInvite = async (token: string): Promise<AcceptedOrganizationInvite> => {
  const response = await tuyau.invites.accept.$post({ token })
  if (response.error) {
    throw toError(response.error, 'Failed to accept invite')
  }

  return response.data as AcceptedOrganizationInvite
}

export const previewOrganizationInvite = async (token: string): Promise<OrganizationInvitePreview> => {
  const response = await tuyau.invites({ token }).preview.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to preview invite')
  }

  return response.data as OrganizationInvitePreview
}
