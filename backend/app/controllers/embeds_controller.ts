import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import Workspace from '#models/workspace'
import { WorkspaceService } from '#services/workspace_service'
import { embedBootstrapValidator } from '#validators/embed'
import { WorkspaceSchema } from '#validators/workspace'
import WorkspaceDocumentService from '#services/workspace_document_service'
import YjsServerService from '#services/yjs_server_service'
import { handleWorkspaceSeedFailure } from '#controllers/helpers/workspace_seed_failure'
import WorkspaceCreated from '#events/workspace_created'
import { createEventContext } from '#contracts/event_context'

const urlUuidPattern = /^[0-9a-f]{32}$/i

class TemplateNotFoundError extends Error {
  constructor() {
    super('Template workspace not found')
    this.name = 'TemplateNotFoundError'
  }
}

function normalizeTemplateId(templateId?: string): string | undefined {
  if (!templateId) {
    return undefined
  }

  const trimmed = templateId.trim()

  if (urlUuidPattern.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`
  }

  return trimmed
}

@inject()
export default class EmbedsController {
  constructor(
    private workspaceService: WorkspaceService,
    private workspaceDocumentService: WorkspaceDocumentService,
    private yjsServerService: YjsServerService
  ) {}

  private async cleanupFailedBootstrap(userId: string, workspaceId: string): Promise<void> {
    await db.transaction(async (trx) => {
      await Workspace.query({ client: trx }).where('id', workspaceId).delete()
      await User.query({ client: trx }).where('id', userId).delete()
    })
  }

  async bootstrap({ request, response, correlationId }: HttpContext) {
    const data = await request.validateUsing(embedBootstrapValidator)
    const templateId = normalizeTemplateId(data.templateId)

    let user: User | undefined
    let workspace: Workspace | undefined
    let templateWorkspace: Workspace | undefined

    try {
      await db.transaction(async (trx) => {
        const template = await Workspace.query({ client: trx })
          .where('id', templateId!)
          .where('is_embed_template', true)
          .first()

        if (!template) {
          throw new TemplateNotFoundError()
        }

        templateWorkspace = template

        user = await User.create(
          {
            email: `guest-${randomUUID()}@example.com`,
            password: randomUUID(),
          },
          { client: trx }
        )

        workspace = await this.workspaceService.createWorkspaceForUser(user.id, 'Workspace', trx, correlationId, {
          onboardingStatus: 'completed',
        })
      })
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        return response.notFound({ error: 'Template workspace not found' })
      }

      if (handleWorkspaceSeedFailure(error, response)) {
        return
      }

      throw error
    }

    if (!user || !workspace) {
      return response.internalServerError({ error: 'Failed to bootstrap workspace' })
    }

    if (templateWorkspace) {
      try {
        const templateDocument = await this.workspaceDocumentService.readSnapshotBundle(templateWorkspace.id, {
          correlationId,
        })

        await this.yjsServerService.replaceDocument(workspace.id, templateDocument, {
          correlationId,
          reason: 'embed-bootstrap-template',
        })

        workspace.name = templateWorkspace.name
        await workspace.save()
      } catch (error) {
        await this.cleanupFailedBootstrap(user.id, workspace.id)

        throw error
      }
    }

    WorkspaceCreated.dispatch(
      workspace.id,
      workspace.organizationId,
      user.id,
      'embed_bootstrap',
      createEventContext({ userId: user.id, workspaceId: workspace.id, organizationId: workspace.organizationId })
    )

    const token = await User.accessTokens.create(user)

    return {
      type: 'bearer',
      value: token.value!.release(),
      workspaceId: workspace.id,
      workspace: await WorkspaceSchema.validate(workspace),
    }
  }
}
