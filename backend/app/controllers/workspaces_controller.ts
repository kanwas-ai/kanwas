import type { HttpContext } from '@adonisjs/core/http'
import Workspace from '#models/workspace'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import { createWorkspaceValidator, updateWorkspaceValidator, WorkspaceSchema } from '#validators/workspace'
import db from '@adonisjs/lucid/services/db'
import { WorkspaceOrganizationContextRequiredError, WorkspaceService } from '#services/workspace_service'
import { inject } from '@adonisjs/core'
import { authorizeWorkspaceAccess } from '#policies/organization_authorization'
import WorkspaceViewed from '#events/workspace_viewed'
import WorkspaceCreated from '#events/workspace_created'
import { createEventContext } from '#contracts/event_context'
import WorkspaceDocumentService from '#services/workspace_document_service'
import YjsServerService from '#services/yjs_server_service'
import { handleWorkspaceSeedFailure } from '#controllers/helpers/workspace_seed_failure'
import { toError } from '#services/error_utils'

type WorkspaceCreateAccessReason = 'workspace_not_found' | 'not_member'

class WorkspaceCreateAccessError extends Error {
  constructor(public readonly reason: WorkspaceCreateAccessReason) {
    super('Workspace create access denied')
    this.name = 'WorkspaceCreateAccessError'
  }
}

class LastWorkspaceDeletionBlockedError extends Error {
  constructor() {
    super('Cannot delete the last workspace in an organization')
    this.name = 'LastWorkspaceDeletionBlockedError'
  }
}

class WorkspaceDeleteNotFoundError extends Error {
  constructor() {
    super('Workspace not found')
    this.name = 'WorkspaceDeleteNotFoundError'
  }
}

@inject()
export default class WorkspacesController {
  constructor(
    private workspaceService: WorkspaceService,
    private workspaceDocumentService: WorkspaceDocumentService,
    private yjsServerService: YjsServerService
  ) {}

  async index({ auth }: HttpContext) {
    const user = auth.getUserOrFail()

    const organizationIdsQuery = OrganizationMembership.query().select('organization_id').where('user_id', user.id)

    const workspaces = await Workspace.query()
      .select('id', 'name', 'organization_id', 'onboarding_status', 'created_at', 'updated_at')
      .whereIn('organization_id', organizationIdsQuery)
      .orderBy('created_at', 'asc')

    return Promise.all(workspaces.map((workspace) => WorkspaceSchema.validate(workspace)))
  }

  async store({ request, auth, response, logger, correlationId }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createWorkspaceValidator)

    let workspace: Workspace | null = null

    try {
      workspace = await db.transaction(async (trx) => {
        if (data.organizationId) {
          const membership = await OrganizationMembership.query({ client: trx })
            .where('user_id', user.id)
            .where('organization_id', data.organizationId)
            .first()

          if (!membership) {
            throw new WorkspaceCreateAccessError('not_member')
          }

          return this.workspaceService.createWorkspaceForOrganization(
            user.id,
            data.name,
            data.organizationId,
            trx,
            correlationId
          )
        }

        if (data.workspaceId) {
          const access = await authorizeWorkspaceAccess(user.id, data.workspaceId)

          if (typeof access === 'string') {
            throw new WorkspaceCreateAccessError(access as WorkspaceCreateAccessReason)
          }

          return this.workspaceService.createWorkspaceForOrganization(
            user.id,
            data.name,
            access.organizationId,
            trx,
            correlationId
          )
        }

        return this.workspaceService.createWorkspaceForUser(user.id, data.name, trx, correlationId)
      })
    } catch (error) {
      if (error instanceof WorkspaceOrganizationContextRequiredError) {
        return response.badRequest({ error: error.message })
      }

      if (error instanceof WorkspaceCreateAccessError) {
        if (error.reason === 'workspace_not_found') {
          return response.notFound({ error: 'Workspace not found' })
        }

        return response.unauthorized({ error: 'Unauthorized' })
      }

      if (
        handleWorkspaceSeedFailure(error, response, {
          logger,
          operation: 'workspace_create_seed_failed',
          message: 'Workspace creation failed during Yjs server seed',
        })
      ) {
        return
      }

      throw error
    }

    if (!workspace) {
      throw new Error('Workspace creation did not return a workspace')
    }

    WorkspaceCreated.dispatch(
      workspace.id,
      workspace.organizationId,
      user.id,
      'manual_create',
      createEventContext({ userId: user.id, workspaceId: workspace.id, organizationId: workspace.organizationId })
    )

    logger.info(
      { operation: 'workspace_create', workspaceId: workspace.id, workspaceName: workspace.name },
      'Workspace created'
    )

    return WorkspaceSchema.validate(workspace)
  }

  async show({ params, auth, organizationId, organizationRole }: HttpContext) {
    const user = auth.getUserOrFail()

    const workspace = await Workspace.query()
      .select('id', 'name', 'organization_id', 'onboarding_status', 'created_at', 'updated_at')
      .where('id', params.id)
      .firstOrFail()

    const resolvedOrganizationId = organizationId ?? workspace.organizationId
    if (resolvedOrganizationId && organizationRole) {
      const organization = await Organization.query()
        .select('id', 'name', 'created_at', 'updated_at')
        .where('id', resolvedOrganizationId)
        .first()

      if (organization) {
        WorkspaceViewed.dispatch(
          user,
          workspace,
          organization,
          organizationRole,
          createEventContext({ userId: user.id, workspaceId: workspace.id })
        )
      }
    }

    return WorkspaceSchema.validate(workspace)
  }

  async update({ params, request }: HttpContext) {
    const workspace = await Workspace.findOrFail(params.id)

    const data = await request.validateUsing(updateWorkspaceValidator)
    workspace.merge(data)
    await workspace.save()

    return WorkspaceSchema.validate(workspace)
  }

  async destroy({ params, response, logger }: HttpContext) {
    let deletedWorkspaceId: string

    try {
      deletedWorkspaceId = await db.transaction(async (trx) => {
        const workspace = await Workspace.query({ client: trx }).where('id', params.id).firstOrFail()

        const organizationWorkspaceIds = await Workspace.query({ client: trx })
          .select('id')
          .where('organization_id', workspace.organizationId)
          .orderBy('id', 'asc')
          .forUpdate()

        const targetStillExists = organizationWorkspaceIds.some(
          (organizationWorkspace) => organizationWorkspace.id === workspace.id
        )

        if (!targetStillExists) {
          throw new WorkspaceDeleteNotFoundError()
        }

        if (organizationWorkspaceIds.length <= 1) {
          throw new LastWorkspaceDeletionBlockedError()
        }

        await Workspace.query({ client: trx }).where('id', workspace.id).delete()

        return workspace.id
      })
    } catch (error) {
      if (error instanceof WorkspaceDeleteNotFoundError) {
        return response.notFound({ error: error.message })
      }

      if (error instanceof LastWorkspaceDeletionBlockedError) {
        return response.conflict({ error: error.message })
      }

      throw error
    }
    logger.info({ operation: 'workspace_delete', workspaceId: deletedWorkspaceId }, 'Workspace deleted')
    return { message: 'Workspace deleted' }
  }

  async duplicate({ params, auth, logger, correlationId }: HttpContext) {
    const user = auth.getUserOrFail()
    const sourceWorkspace = await Workspace.findOrFail(params.id)

    const sourceDocument = await this.workspaceDocumentService.readSnapshotBundle(sourceWorkspace.id, {
      correlationId,
    })

    const newWorkspace = await db.transaction(async (trx) => {
      return this.workspaceService.createWorkspaceForOrganization(
        user.id,
        `${sourceWorkspace.name} (Copy)`,
        sourceWorkspace.organizationId,
        trx,
        correlationId,
        { onboardingStatus: 'completed' }
      )
    })

    try {
      await this.yjsServerService.replaceDocument(newWorkspace.id, sourceDocument, {
        correlationId,
        reason: 'duplicate',
      })
      await newWorkspace.refresh()
    } catch (error) {
      try {
        await Workspace.query().where('id', newWorkspace.id).delete()
      } catch (cleanupError) {
        logger.error(
          {
            operation: 'workspace_duplicate_cleanup_failed',
            sourceId: params.id,
            newId: newWorkspace.id,
            err: toError(cleanupError),
          },
          'Failed to cleanup duplicated workspace after Yjs server persistence failure'
        )
      }

      throw error
    }

    logger.info(
      { operation: 'workspace_duplicate', sourceId: params.id, newId: newWorkspace.id },
      'Workspace duplicated'
    )

    WorkspaceCreated.dispatch(
      newWorkspace.id,
      newWorkspace.organizationId,
      user.id,
      'duplicate',
      createEventContext({ userId: user.id, workspaceId: newWorkspace.id, organizationId: newWorkspace.organizationId })
    )

    return WorkspaceSchema.validate(newWorkspace)
  }
}
