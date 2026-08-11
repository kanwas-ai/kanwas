import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import OrganizationMembership from '#models/organization_membership'
import { OrganizationMemberSchema, updateOrganizationMemberRoleValidator } from '#validators/organization_member'
import OrganizationMemberService, {
  LastAdminRemovalBlockedError,
  OrganizationMemberNotFoundError,
  SelfRemovalForbiddenError,
} from '#services/organization_member_service'

@inject()
export default class OrganizationMembersController {
  constructor(private organizationMemberService: OrganizationMemberService) {}

  private serializeMembership(membership: OrganizationMembership) {
    return {
      id: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: membership.role,
      name: membership.user.name,
      email: membership.user.email,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    }
  }

  async index({ response, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const memberships = await OrganizationMembership.query()
      .where('organization_id', organizationId)
      .preload('user')
      .orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')

    return Promise.all(
      memberships.map((membership) => OrganizationMemberSchema.validate(this.serializeMembership(membership)))
    )
  }

  async updateRole({ request, params, response, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const data = await request.validateUsing(updateOrganizationMemberRoleValidator)

    try {
      const membership = await this.organizationMemberService.updateMemberRole({
        organizationId,
        targetUserId: params.userId,
        newRole: data.role,
      })

      return OrganizationMemberSchema.validate(this.serializeMembership(membership))
    } catch (error) {
      if (error instanceof LastAdminRemovalBlockedError) {
        return response.conflict({
          code: error.code,
          error: error.message,
        })
      }

      if (error instanceof OrganizationMemberNotFoundError) {
        return response.notFound({
          code: error.code,
          error: error.message,
        })
      }

      throw error
    }
  }

  async destroy({ auth, params, response, organizationId }: HttpContext) {
    if (!organizationId) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const user = auth.getUserOrFail()

    try {
      await this.organizationMemberService.removeOrganizationMember({
        organizationId,
        actorUserId: user.id,
        targetUserId: params.userId,
      })

      return { removedUserId: params.userId }
    } catch (error) {
      if (error instanceof SelfRemovalForbiddenError) {
        return response.forbidden({
          code: error.code,
          error: error.message,
        })
      }

      if (error instanceof LastAdminRemovalBlockedError) {
        return response.conflict({
          code: error.code,
          error: error.message,
        })
      }

      if (error instanceof OrganizationMemberNotFoundError) {
        return response.notFound({
          code: error.code,
          error: error.message,
        })
      }

      throw error
    }
  }
}
