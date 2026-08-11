import { createHash, randomBytes } from 'node:crypto'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import OrganizationInvite from '#models/organization_invite'
import OrganizationMembership from '#models/organization_membership'
import OAuthState from '#models/oauth_state'
import type { OrganizationRole } from '#models/organization_membership'
import { WorkspaceService } from '#services/workspace_service'

const DEFAULT_INVITE_TTL_DAYS = 30
const OAUTH_STATE_TTL_MINUTES = 10

export class InvalidInviteTokenError extends Error {
  constructor(message: string = 'Invite token is invalid, expired, revoked, or already used') {
    super(message)
    this.name = 'InvalidInviteTokenError'
  }
}

export class InvalidOAuthStateError extends Error {
  constructor(message: string = 'OAuth state is invalid or expired') {
    super(message)
    this.name = 'InvalidOAuthStateError'
  }
}

export interface InviteAcceptanceResult {
  organizationId: string
  workspaceId: string
  role: OrganizationRole
  inviteeName: string
}

export interface InvitePreviewResult {
  organizationName: string
  inviteeName: string
  roleToGrant: OrganizationRole
  expiresAt: DateTime
}

export interface CreateInviteOptions {
  organizationId: string
  createdBy: string
  inviteeName?: string
  roleToGrant?: OrganizationRole
  expiresInDays?: number
}

@inject()
export default class OrganizationInviteService {
  constructor(private workspaceService: WorkspaceService) {}

  async createInvite(options: CreateInviteOptions): Promise<{ invite: OrganizationInvite; token: string }> {
    return db.transaction(async (trx) => {
      const roleToGrant = options.roleToGrant ?? 'member'
      const expiresInDays = options.expiresInDays ?? DEFAULT_INVITE_TTL_DAYS
      const expiresAt = DateTime.utc().plus({ days: expiresInDays })
      const token = this.generateToken()

      const invite = await OrganizationInvite.create(
        {
          organizationId: options.organizationId,
          tokenHash: this.hashValue(token),
          createdBy: options.createdBy,
          inviteeName: options.inviteeName || 'Invited member',
          roleToGrant,
          expiresAt,
        },
        { client: trx }
      )

      return { invite, token }
    })
  }

  async revokeInvite(organizationId: string, inviteId: string): Promise<OrganizationInvite | null> {
    return db.transaction(async (trx) => {
      const invite = await OrganizationInvite.query({ client: trx })
        .where('id', inviteId)
        .where('organization_id', organizationId)
        .forUpdate()
        .first()

      if (!invite) {
        return null
      }

      if (!invite.revokedAt) {
        invite.revokedAt = DateTime.utc()
        await invite.save()
      }

      return invite
    })
  }

  async acceptInviteTokenForUser(
    token: string,
    userId: string,
    trx?: TransactionClientContract
  ): Promise<InviteAcceptanceResult> {
    if (trx) {
      return this.acceptInviteByTokenInTransaction(token, userId, trx)
    }

    return db.transaction(async (innerTrx) => {
      return this.acceptInviteByTokenInTransaction(token, userId, innerTrx)
    })
  }

  async acceptInviteByIdForUser(
    inviteId: string,
    userId: string,
    trx?: TransactionClientContract
  ): Promise<InviteAcceptanceResult> {
    if (trx) {
      return this.acceptInviteByIdInTransaction(inviteId, userId, trx)
    }

    return db.transaction(async (innerTrx) => {
      return this.acceptInviteByIdInTransaction(inviteId, userId, innerTrx)
    })
  }

  async createOAuthState(inviteToken?: string): Promise<string> {
    return db.transaction(async (trx) => {
      const state = this.generateToken()
      let inviteId: string | null = null

      if (inviteToken) {
        const invite = await this.findActiveInviteByToken(inviteToken, trx)
        if (!invite) {
          throw new InvalidInviteTokenError()
        }

        inviteId = invite.id
      }

      await OAuthState.create(
        {
          stateHash: this.hashValue(state),
          inviteId,
          expiresAt: DateTime.utc().plus({ minutes: OAUTH_STATE_TTL_MINUTES }),
        },
        { client: trx }
      )

      return state
    })
  }

  async consumeOAuthState(state: string, trx?: TransactionClientContract): Promise<{ inviteId: string | null }> {
    if (trx) {
      return this.consumeOAuthStateInTransaction(state, trx)
    }

    return db.transaction(async (innerTrx) => {
      return this.consumeOAuthStateInTransaction(state, innerTrx)
    })
  }

  async previewInviteToken(token: string): Promise<InvitePreviewResult> {
    const invite = await OrganizationInvite.query()
      .where('token_hash', this.hashValue(token))
      .whereNull('revoked_at')
      .whereNull('consumed_at')
      .where('expires_at', '>', DateTime.utc().toJSDate())
      .preload('organization')
      .first()

    if (!invite || !invite.organization) {
      throw new InvalidInviteTokenError()
    }

    return {
      organizationName: invite.organization.name,
      inviteeName: invite.inviteeName,
      roleToGrant: invite.roleToGrant,
      expiresAt: invite.expiresAt,
    }
  }

  private async consumeOAuthStateInTransaction(
    state: string,
    trx: TransactionClientContract
  ): Promise<{ inviteId: string | null }> {
    const stateRow = await OAuthState.query({ client: trx })
      .where('state_hash', this.hashValue(state))
      .forUpdate()
      .first()

    if (!stateRow || stateRow.consumedAt || stateRow.expiresAt <= DateTime.utc()) {
      throw new InvalidOAuthStateError()
    }

    stateRow.consumedAt = DateTime.utc()
    await stateRow.save()

    return { inviteId: stateRow.inviteId }
  }

  private async acceptInviteByTokenInTransaction(
    token: string,
    userId: string,
    trx: TransactionClientContract
  ): Promise<InviteAcceptanceResult> {
    const invite = await OrganizationInvite.query({ client: trx })
      .where('token_hash', this.hashValue(token))
      .forUpdate()
      .first()

    return this.acceptActiveInvite(invite, userId, trx)
  }

  private async acceptInviteByIdInTransaction(
    inviteId: string,
    userId: string,
    trx: TransactionClientContract
  ): Promise<InviteAcceptanceResult> {
    const invite = await OrganizationInvite.query({ client: trx }).where('id', inviteId).forUpdate().first()
    return this.acceptActiveInvite(invite, userId, trx)
  }

  private async acceptActiveInvite(
    invite: OrganizationInvite | null,
    userId: string,
    trx: TransactionClientContract
  ): Promise<InviteAcceptanceResult> {
    if (!invite || invite.revokedAt || invite.consumedAt || invite.expiresAt <= DateTime.utc()) {
      throw new InvalidInviteTokenError()
    }

    const existingMembership = await OrganizationMembership.query({ client: trx })
      .where('organization_id', invite.organizationId)
      .where('user_id', userId)
      .forUpdate()
      .first()

    if (existingMembership) {
      throw new InvalidInviteTokenError('You are already a member of this team')
    }

    let membership: OrganizationMembership

    try {
      membership = await OrganizationMembership.create(
        {
          organizationId: invite.organizationId,
          userId,
          role: invite.roleToGrant,
        },
        { client: trx }
      )
    } catch (error) {
      if (this.isOrganizationMembershipUniqueViolation(error)) {
        throw new InvalidInviteTokenError('You are already a member of this team')
      }

      throw error
    }

    invite.consumedAt = DateTime.utc()
    invite.consumedByUserId = userId
    await invite.save()

    const workspace = await this.workspaceService.getOrganizationWorkspace(invite.organizationId, trx)

    return {
      organizationId: invite.organizationId,
      workspaceId: workspace.id,
      role: membership.role,
      inviteeName: invite.inviteeName,
    }
  }

  private isOrganizationMembershipUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const dbError = error as {
      code?: string
      constraint?: string
      table?: string
      detail?: string
    }

    if (dbError.code !== '23505') {
      return false
    }

    if (dbError.constraint === 'organization_memberships_organization_id_user_id_unique') {
      return true
    }

    if (dbError.table === 'organization_memberships') {
      return true
    }

    return typeof dbError.detail === 'string' && dbError.detail.includes('(organization_id, user_id)')
  }

  private async findActiveInviteByToken(
    token: string,
    trx: TransactionClientContract
  ): Promise<OrganizationInvite | null> {
    return OrganizationInvite.query({ client: trx })
      .where('token_hash', this.hashValue(token))
      .whereNull('revoked_at')
      .whereNull('consumed_at')
      .where('expires_at', '>', DateTime.utc().toJSDate())
      .first()
  }

  private generateToken(): string {
    return randomBytes(32).toString('base64url')
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  async listInvitesForOrganization(organizationId: string): Promise<OrganizationInvite[]> {
    return OrganizationInvite.query()
      .where('organization_id', organizationId)
      .orderBy('created_at', 'desc')
      .preload('creator')
  }
}
