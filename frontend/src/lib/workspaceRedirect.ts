import type { Workspace } from '@/api/client'

export type RedirectWorkspace = Pick<Workspace, 'id' | 'organizationId'>

interface ResolveWorkspaceRedirectOptions {
  preferredWorkspaceIds?: Array<string | null | undefined>
  preferredOrganizationIds?: Array<string | null | undefined>
  fallbackToFirstWorkspace?: boolean
}

export function resolveWorkspaceRedirect(
  workspaces: RedirectWorkspace[],
  options: ResolveWorkspaceRedirectOptions = {}
): RedirectWorkspace | null {
  if (workspaces.length === 0) {
    return null
  }

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))

  for (const workspaceId of options.preferredWorkspaceIds ?? []) {
    if (!workspaceId) {
      continue
    }

    const workspace = workspaceById.get(workspaceId)
    if (workspace) {
      return workspace
    }
  }

  for (const organizationId of options.preferredOrganizationIds ?? []) {
    if (!organizationId) {
      continue
    }

    const workspace = workspaces.find((candidate) => candidate.organizationId === organizationId)
    if (workspace) {
      return workspace
    }
  }

  if (options.fallbackToFirstWorkspace === false) {
    return null
  }

  return workspaces[0]
}
