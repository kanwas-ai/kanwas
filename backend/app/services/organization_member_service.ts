import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import OrganizationMembership from '#models/organization_membership'
import type { OrganizationRole } from '#models/organization_membership'

export const OrganizationMemberRemovalErrorCode = {
  LAST_ADMIN_REMOVAL_BLOCKED: 'LAST_ADMIN_REMOVAL_BLOCKED',
  SELF_REMOVAL_FORBIDDEN: 'SELF_REMOVAL_FORBIDDEN',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
} as const

export class LastAdminRemovalBlockedError extends Error {
  code = OrganizationMemberRemovalErrorCode.LAST_ADMIN_REMOVAL_BLOCKED

  constructor(message = 'Cannot remove the last remaining organization admin') {
    super(message)
    this.name = 'LastAdminRemovalBlockedError'
  }
}

export class SelfRemovalForbiddenError extends Error {
  code = OrganizationMemberRemovalErrorCode.SELF_REMOVAL_FORBIDDEN

  constructor(message = 'Admins cannot remove themselves from the organization') {
    super(message)
    this.name = 'SelfRemovalForbiddenError'
  }
}

export class OrganizationMemberNotFoundError extends Error {
  code = OrganizationMemberRemovalErrorCode.MEMBER_NOT_FOUND

  constructor(message = 'Organization member not found') {
    super(message)
    this.name = 'OrganizationMemberNotFoundError'
  }
}

interface RemoveOrganizationMemberOptions {
  organizationId: string
  actorUserId: string
  targetUserId: string
  trx?: TransactionClientContract
}

@inject()
export default class OrganizationMemberService {
  async removeOrganizationMember(options: RemoveOrganizationMemberOptions): Promise<void> {
    if (options.actorUserId === options.targetUserId) {
      throw new SelfRemovalForbiddenError()
    }

    if (options.trx) {
      await this.removeOrganizationMemberInTransaction(options, options.trx)
      return
    }

    await db.transaction(async (trx) => {
      await this.removeOrganizationMemberInTransaction(options, trx)
    })
  }

  async updateMemberRole(options: {
    organizationId: string
    targetUserId: string
    newRole: OrganizationRole
  }): Promise<OrganizationMembership> {
    return db.transaction(async (trx) => {
      const memberships = await OrganizationMembership.query({ client: trx })
        .where('organization_id', options.organizationId)
        .orderBy('id', 'asc')
        .forUpdate()

      const targetMembership = memberships.find((m) => m.userId === options.targetUserId)
      if (!targetMembership) {
        throw new OrganizationMemberNotFoundError()
      }

      // Prevent demoting the last admin
      if (targetMembership.role === 'admin' && options.newRole !== 'admin') {
        const adminCount = memberships.filter((m) => m.role === 'admin').length
        if (adminCount <= 1) {
          throw new LastAdminRemovalBlockedError('Cannot demote the last remaining admin')
        }
      }

      targetMembership.role = options.newRole
      await targetMembership.save()

      await targetMembership.load('user')
      return targetMembership
    })
  }

  private async removeOrganizationMemberInTransaction(
    options: RemoveOrganizationMemberOptions,
    trx: TransactionClientContract
  ): Promise<void> {
    const memberships = await OrganizationMembership.query({ client: trx })
      .where('organization_id', options.organizationId)
      .orderBy('id', 'asc')
      .forUpdate()

    const targetMembership = memberships.find((membership) => membership.userId === options.targetUserId)

    if (!targetMembership) {
      throw new OrganizationMemberNotFoundError()
    }

    if (targetMembership.role === 'admin') {
      const adminMembershipCount = memberships.filter((membership) => membership.role === 'admin').length

      if (adminMembershipCount <= 1) {
        throw new LastAdminRemovalBlockedError()
      }
    }

    await targetMembership.delete()
  }
}
