import Workspace from '#models/workspace'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { inject } from '@adonisjs/core'
import WorkspaceBootstrapService from '#services/workspace_bootstrap_service'
import YjsServerService from '#services/yjs_server_service'
import DefaultWorkspaceTemplateService from '#services/default_workspace_template_service'
import Organization from '#models/organization'
import OrganizationMembership from '#models/organization_membership'
import User from '#models/user'
import type { WorkspaceOnboardingStatus } from '#types/workspace_onboarding'

export class WorkspaceOrganizationContextRequiredError extends Error {
  constructor() {
    super('Workspace context is required when user belongs to multiple organizations')
    this.name = 'WorkspaceOrganizationContextRequiredError'
  }
}

export class OrganizationWorkspaceNotFoundError extends Error {
  constructor(organizationId: string) {
    super(`Organization ${organizationId} does not have a workspace`)
    this.name = 'OrganizationWorkspaceNotFoundError'
  }
}

export class WorkspaceSeedFailedError extends Error {
  declare cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'WorkspaceSeedFailedError'
    this.cause = options?.cause
  }
}

interface CreateWorkspaceRecordOptions {
  ownerUserId: string
  workspaceName: string
  organizationId: string
  trx: TransactionClientContract
  attachUserId?: string
  correlationId?: string
  onboardingStatus?: WorkspaceOnboardingStatus
}

@inject()
export class WorkspaceService {
  constructor(
    private workspaceBootstrapService: WorkspaceBootstrapService,
    private yjsServerService: YjsServerService,
    private defaultWorkspaceTemplateService: DefaultWorkspaceTemplateService
  ) {}

  private async createWorkspaceRecord(options: CreateWorkspaceRecordOptions): Promise<Workspace> {
    const workspace = await Workspace.create(
      {
        name: options.workspaceName,
        organizationId: options.organizationId,
        onboardingStatus: options.onboardingStatus ?? 'not_started',
      },
      { client: options.trx }
    )

    if (options.attachUserId) {
      await this.attachWorkspaceUser(workspace.id, options.attachUserId, options.trx)
    }

    let materializedTemplateAssetPaths: string[] = []

    try {
      const uploadedDefaultTemplate =
        await this.defaultWorkspaceTemplateService.buildActiveTemplateSnapshotForWorkspace(workspace.id)
      materializedTemplateAssetPaths = uploadedDefaultTemplate?.assetStoragePaths ?? []

      const document =
        uploadedDefaultTemplate?.snapshot ??
        (await this.workspaceBootstrapService.createSnapshotBundle({
          ownerUserId: options.ownerUserId,
        }))

      await this.yjsServerService.replaceDocument(workspace.id, document, {
        correlationId: options.correlationId,
        reason: 'workspace-create',
        notifyBackend: false,
      })
    } catch (error) {
      if (materializedTemplateAssetPaths.length > 0) {
        await this.defaultWorkspaceTemplateService.deleteTemplateAssetFiles(materializedTemplateAssetPaths)
      }

      throw new WorkspaceSeedFailedError(`Failed to seed workspace ${workspace.id} in Yjs server durability store`, {
        cause: error,
      })
    }

    return workspace
  }

  /**
   * Create a workspace with empty workspace document for a user
   */
  async createWorkspaceForUser(
    userId: string,
    workspaceName: string,
    trx: TransactionClientContract,
    correlationId?: string,
    options: { onboardingStatus?: WorkspaceOnboardingStatus } = {}
  ): Promise<Workspace> {
    const organizationId = await this.resolvePrimaryOrganizationForUser(userId, trx)
    return this.createWorkspaceForOrganization(userId, workspaceName, organizationId, trx, correlationId, options)
  }

  async createWorkspaceForOrganization(
    userId: string,
    workspaceName: string,
    organizationId: string,
    trx: TransactionClientContract,
    correlationId?: string,
    options: { onboardingStatus?: WorkspaceOnboardingStatus } = {}
  ): Promise<Workspace> {
    return this.createWorkspaceRecord({
      ownerUserId: userId,
      workspaceName,
      organizationId,
      trx,
      attachUserId: userId,
      correlationId,
      onboardingStatus: options.onboardingStatus,
    })
  }

  async attachWorkspaceUser(workspaceId: string, userId: string, trx: TransactionClientContract): Promise<void> {
    await trx.table('workspace_users').insert({
      workspace_id: workspaceId,
      user_id: userId,
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  async getOrganizationWorkspace(organizationId: string, trx: TransactionClientContract): Promise<Workspace> {
    const workspace = await Workspace.query({ client: trx })
      .where('organization_id', organizationId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .forUpdate()
      .first()

    if (!workspace) {
      throw new OrganizationWorkspaceNotFoundError(organizationId)
    }

    return workspace
  }

  private async resolvePrimaryOrganizationForUser(userId: string, trx: TransactionClientContract): Promise<string> {
    const adminMembership = await OrganizationMembership.query({ client: trx })
      .where('user_id', userId)
      .where('role', 'admin')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .first()

    if (adminMembership) {
      return adminMembership.organizationId
    }

    const memberships = await OrganizationMembership.query({ client: trx })
      .where('user_id', userId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .limit(2)

    if (memberships.length === 1) {
      return memberships[0].organizationId
    }

    if (memberships.length > 1) {
      throw new WorkspaceOrganizationContextRequiredError()
    }

    const user = await User.query({ client: trx }).where('id', userId).firstOrFail()
    const organization = await Organization.create(
      {
        name: this.buildPersonalOrganizationName(user.email),
      },
      { client: trx }
    )

    await OrganizationMembership.create(
      {
        organizationId: organization.id,
        userId,
        role: 'admin',
      },
      { client: trx }
    )

    return organization.id
  }
  private buildPersonalOrganizationName(email: string): string {
    const localPart = email.split('@')[0]?.trim() ?? ''
    const cleaned = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) {
      return "User's organization"
    }

    const displayName = cleaned
      .split(' ')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')

    return `${displayName}'s organization`
  }
}
