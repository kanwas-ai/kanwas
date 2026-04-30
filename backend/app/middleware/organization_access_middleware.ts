import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  authorizeWorkspaceAccess,
  extractInvocationIdFromSignedPath,
  extractWorkspaceIdFromSignedPath,
  isUuid,
} from '#policies/organization_authorization'
import Invocation from '#models/invocation'

type OrganizationAccessOptions = {
  requireAdmin?: boolean
}

export default class OrganizationAccessMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: OrganizationAccessOptions = {}) {
    const workspaceId = await this.resolveWorkspaceId(ctx)
    const routeName = typeof ctx.route?.name === 'string' ? ctx.route.name : null

    if (!workspaceId) {
      const path = ctx.request.input('path')
      const missingPath = typeof path !== 'string' || path.trim().length === 0

      if (routeName === 'files.signedUrl' && missingPath) {
        return ctx.response.badRequest({ error: 'Path parameter is required' })
      }

      return ctx.response.badRequest({ error: 'Workspace ID is required' })
    }

    const user = ctx.auth.getUserOrFail()
    const access = await authorizeWorkspaceAccess(user.id, workspaceId, {
      requireAdmin: options.requireAdmin,
    })

    if (access === 'workspace_not_found') {
      return ctx.response.notFound({ error: 'Workspace not found' })
    }

    if (access === 'not_member') {
      return ctx.response.unauthorized({ error: 'Unauthorized' })
    }

    if (access === 'not_admin') {
      return ctx.response.forbidden({ error: 'Admin role required' })
    }

    ctx.workspaceId = access.workspace.id
    ctx.organizationId = access.organizationId
    ctx.organizationRole = access.role

    return next()
  }

  private async resolveWorkspaceId(ctx: HttpContext): Promise<string | null> {
    const params = ctx.request.params()
    const idParam = typeof params.id === 'string' ? params.id : null
    if (idParam && isUuid(idParam)) {
      return idParam
    }

    const workspaceParam = typeof params.workspaceId === 'string' ? params.workspaceId : null
    if (workspaceParam && isUuid(workspaceParam)) {
      return workspaceParam
    }

    const bodyWorkspaceId = ctx.request.input('workspaceId')
    if (typeof bodyWorkspaceId === 'string' && isUuid(bodyWorkspaceId)) {
      return bodyWorkspaceId
    }

    const bodyWorkspaceIdSnake = ctx.request.input('workspace_id')
    if (typeof bodyWorkspaceIdSnake === 'string' && isUuid(bodyWorkspaceIdSnake)) {
      return bodyWorkspaceIdSnake
    }

    const filePath = ctx.request.input('path')
    if (typeof filePath === 'string') {
      const directWorkspaceId = extractWorkspaceIdFromSignedPath(filePath)
      if (directWorkspaceId) {
        return directWorkspaceId
      }

      const invocationId = extractInvocationIdFromSignedPath(filePath)
      if (invocationId) {
        const invocation = await Invocation.query().where('id', invocationId).first()
        return invocation?.workspaceId ?? null
      }
    }

    return null
  }
}
