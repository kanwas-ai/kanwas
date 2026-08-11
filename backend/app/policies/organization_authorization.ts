import Workspace from '#models/workspace'
import OrganizationMembership from '#models/organization_membership'
import type { OrganizationRole } from '#models/organization_membership'

export type WorkspaceAccessFailure = 'workspace_not_found' | 'not_member' | 'not_admin'

export interface WorkspaceAccessSuccess {
  workspace: Workspace
  organizationId: string
  role: OrganizationRole
}

export async function authorizeWorkspaceAccess(
  userId: string,
  workspaceId: string,
  options: { requireAdmin?: boolean } = {}
): Promise<WorkspaceAccessSuccess | WorkspaceAccessFailure> {
  const workspace = await Workspace.query().where('id', workspaceId).first()

  if (!workspace) {
    return 'workspace_not_found'
  }

  const membership = await OrganizationMembership.query()
    .where('organization_id', workspace.organizationId)
    .where('user_id', userId)
    .first()

  if (!membership) {
    return 'not_member'
  }

  if (options.requireAdmin && membership.role !== 'admin') {
    return 'not_admin'
  }

  return {
    workspace,
    organizationId: workspace.organizationId,
    role: membership.role,
  }
}

export function extractWorkspaceIdFromSignedPath(pathValue: string): string | null {
  const [prefix, workspaceId] = pathValue.split('/')

  if (prefix !== 'files' || !workspaceId) {
    return null
  }

  return isUuid(workspaceId) ? workspaceId : null
}

export function extractInvocationIdFromSignedPath(pathValue: string): string | null {
  const [prefix, invocationId] = pathValue.split('/')

  if (prefix !== 'invocations' || !invocationId) {
    return null
  }

  return isUuid(invocationId) ? invocationId : null
}

export function isUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}
