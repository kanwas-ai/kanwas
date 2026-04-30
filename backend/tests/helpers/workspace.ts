import type User from '#models/user'
import type Workspace from '#models/workspace'
import { WorkspaceService } from '#services/workspace_service'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'

/**
 * Creates a test workspace using WorkspaceService to ensure proper initialization
 * with document structure. This is the ONLY correct way to create workspaces in tests.
 *
 * @param user - The user who will be admin in workspace organization
 * @param name - Optional workspace name (defaults to 'Test Workspace')
 * @returns Promise<Workspace> - The created workspace with initialized document
 */
export async function createTestWorkspace(user: User, name: string = 'Test Workspace'): Promise<Workspace> {
  const workspaceService = await app.container.make(WorkspaceService)
  const workspace = await db.transaction(async (trx) => {
    return await workspaceService.createWorkspaceForUser(user.id, name, trx)
  })

  await workspace.refresh()

  return workspace
}
