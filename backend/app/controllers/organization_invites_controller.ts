import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import OrganizationInviteService, { InvalidInviteTokenError } from '#services/organization_invite_service'
import OrganizationInvite from '#models/organization_invite'
import { OrganizationWorkspaceNotFoundError } from '#services/workspace_service'
import {
  acceptOrganizationInviteValidator,
  createOrganizationInviteValidator,
  previewOrganizationInviteValidator,
  OrganizationInvitePreviewSchema,
  OrganizationInviteSchema,
} from '#validators/organization_invite'
import { handleWorkspaceSeedFailure } from '#controllers/helpers/workspace_seed_failure'

@inject()
export default class OrganizationInvitesController {
  constructor(private organizationInviteService: OrganizationInviteService) {}

  private serializeInvite(invite: OrganizationInvite) {
    return {
      id: invite.id,
      organizationId: invite.organizationId,
      inviteeName: invite.inviteeName,
      roleToGrant: invite.roleToGrant,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt ?? null,
      consumedAt: invite.consumedAt ?? null,
      consumedByUserId: invite.consumedByUserId ?? null,
      createdBy: invite.createdBy,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
    }
  }

  async index({ response, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const invites = await this.organizationInviteService.listInvitesForOrganization(organizationId)
    return Promise.all(invites.map((invite) => OrganizationInviteSchema.validate(this.serializeInvite(invite))))
  }

  async store({ request, response, auth, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createOrganizationInviteValidator)

    const { invite, token } = await this.organizationInviteService.createInvite({
      organizationId,
      createdBy: user.id,
      inviteeName: data.inviteeName ?? undefined,
      roleToGrant: data.roleToGrant,
      expiresInDays: data.expiresInDays,
    })

    return {
      invite: await OrganizationInviteSchema.validate(this.serializeInvite(invite)),
      token,
    }
  }

  async revoke({ params, response, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const invite = await this.organizationInviteService.revokeInvite(organizationId, params.inviteId)
    if (!invite) {
      return response.notFound({ error: 'Invite not found' })
    }

    return { invite: await OrganizationInviteSchema.validate(this.serializeInvite(invite)) }
  }

  async preview({ params, response }: HttpContext) {
    const data = await previewOrganizationInviteValidator.validate(params)

    try {
      const invitePreview = await this.organizationInviteService.previewInviteToken(data.token)
      return OrganizationInvitePreviewSchema.validate(invitePreview)
    } catch (error) {
      if (error instanceof InvalidInviteTokenError) {
        return response.badRequest({ error: error.message })
      }

      throw error
    }
  }

  async accept({ request, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(acceptOrganizationInviteValidator)

    try {
      const result = await this.organizationInviteService.acceptInviteTokenForUser(data.token, user.id)

      return {
        organizationId: result.organizationId,
        workspaceId: result.workspaceId,
        role: result.role,
        inviteeName: result.inviteeName,
      }
    } catch (error) {
      if (error instanceof InvalidInviteTokenError) {
        return response.badRequest({ error: error.message })
      }

      if (error instanceof OrganizationWorkspaceNotFoundError) {
        return response.conflict({ error: error.message })
      }

      if (handleWorkspaceSeedFailure(error, response)) {
        return
      }

      throw error
    }
  }
}
