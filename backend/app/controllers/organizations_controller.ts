import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import { MyOrganizationSchema, OrganizationSchema, updateOrganizationValidator } from '#validators/organization'
import OrganizationUsageService from '#services/organization_usage_service'

@inject()
export default class OrganizationsController {
  constructor(private readonly organizationUsageService: OrganizationUsageService) {}

  private async serializeOrganization(organization: Organization, role: 'admin' | 'member') {
    const usage = await this.organizationUsageService.getCurrentUsageSnapshot(organization)

    return OrganizationSchema.validate({
      id: organization.id,
      name: organization.name,
      role,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      weeklyLimitCents: organization.weeklyLimitCents,
      monthlyLimitCents: organization.monthlyLimitCents,
      billingCycleAnchorUtc: organization.billingCycleAnchorUtc,
      usage: {
        weekly: {
          usedCents: usage.weekly.usedCents,
          limitCents: usage.weekly.limitCents,
          remainingCents: usage.weekly.remainingCents,
          percent: usage.weekly.percent,
          periodStartUtc: usage.weekly.periodStartUtc,
          periodEndUtc: usage.weekly.periodEndUtc,
        },
        monthly: {
          usedCents: usage.monthly.usedCents,
          limitCents: usage.monthly.limitCents,
          remainingCents: usage.monthly.remainingCents,
          percent: usage.monthly.percent,
          periodStartUtc: usage.monthly.periodStartUtc,
          periodEndUtc: usage.monthly.periodEndUtc,
        },
        isOutOfUsage: usage.isOutOfUsage,
        lastSyncedAt: usage.lastSyncedAt,
      },
    })
  }

  async index({ auth }: HttpContext) {
    const user = auth.getUserOrFail()

    const memberships = await OrganizationMembership.query()
      .where('user_id', user.id)
      .preload('organization', (query) => {
        query.preload('workspaces', (wsQuery) => {
          wsQuery.orderBy('created_at', 'asc')
        })
      })
      .orderBy('created_at', 'asc')

    return Promise.all(
      memberships.map((m) =>
        MyOrganizationSchema.validate({
          id: m.organization.id,
          name: m.organization.name,
          role: m.role,
          defaultWorkspaceId: m.organization.workspaces[0]?.id ?? null,
        })
      )
    )
  }

  async showCurrent({ response, organizationId, organizationRole }: HttpContext) {
    if (!organizationId || !organizationRole) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const organization = await Organization.findOrFail(organizationId)
    return this.serializeOrganization(organization, organizationRole)
  }

  async update({ request, response, organizationId, organizationRole }: HttpContext) {
    if (!organizationId || !organizationRole) {
      return response.badRequest({ error: 'Workspace context is required' })
    }

    const data = await request.validateUsing(updateOrganizationValidator)
    const organization = await Organization.findOrFail(organizationId)
    organization.name = data.name
    await organization.save()

    return this.serializeOrganization(organization, organizationRole)
  }
}
