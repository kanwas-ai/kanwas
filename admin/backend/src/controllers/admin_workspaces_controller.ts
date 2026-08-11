import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { stringify as stringifyUuid, validate as validateUuid } from 'uuid'
import Workspace from 'backend/models/workspace'
import WorkspaceDocumentService from 'backend/services/workspace-document'
import DefaultWorkspaceTemplateService, {
  InvalidDefaultWorkspaceTemplateError,
  UnsupportedDefaultWorkspaceTemplateError,
} from 'backend/services/default-workspace-template'

function normalizeWorkspaceIdSearch(value: string): string | null {
  if (/^[0-9a-f]{32}$/i.test(value)) {
    return stringifyUuid(Buffer.from(value, 'hex'))
  }

  return validateUuid(value) ? value.toLowerCase() : null
}

@inject()
export default class AdminWorkspacesController {
  constructor(
    private workspaceDocumentService: WorkspaceDocumentService,
    private defaultWorkspaceTemplateService: DefaultWorkspaceTemplateService
  ) {}

  async index({ request }: HttpContext) {
    const search = request.input('search', '').trim()
    const normalizedWorkspaceId = normalizeWorkspaceIdSearch(search)
    const query = Workspace.query().preload('organization').orderBy('created_at', 'desc')

    if (search) {
      query.where((workspaceQuery) => {
        workspaceQuery.whereILike('workspaces.name', `%${search}%`).orWhereHas('organization', (organizationQuery) => {
          organizationQuery.whereILike('name', `%${search}%`)
        })

        if (normalizedWorkspaceId) {
          workspaceQuery.orWhere('workspaces.id', normalizedWorkspaceId)
        }
      })
    }

    const workspaces = await query.limit(100)

    return workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      organization: workspace.organization
        ? { id: workspace.organization.id, name: workspace.organization.name }
        : null,
      createdAt: workspace.createdAt.toISO(),
      updatedAt: workspace.updatedAt.toISO(),
    }))
  }

  async exportTemplate({ params, response, correlationId }: HttpContext) {
    const workspace = await Workspace.query().preload('organization').where('id', params.id).first()
    if (!workspace) {
      return response.notFound({ error: 'Workspace not found' })
    }

    try {
      const snapshot = await this.workspaceDocumentService.readSnapshotBundle(workspace.id, { correlationId })
      const template = await this.defaultWorkspaceTemplateService.buildPortableTemplateFile({
        workspaceId: workspace.id,
        name: workspace.name,
        snapshot,
      })

      response.header('content-type', 'application/json; charset=utf-8')
      response.header(
        'content-disposition',
        `attachment; filename="${this.defaultWorkspaceTemplateService.buildDownloadFilename(workspace.name)}"`
      )

      return template
    } catch (error) {
      if (
        error instanceof InvalidDefaultWorkspaceTemplateError ||
        error instanceof UnsupportedDefaultWorkspaceTemplateError
      ) {
        return response.badRequest({ error: error.message })
      }

      throw error
    }
  }
}
