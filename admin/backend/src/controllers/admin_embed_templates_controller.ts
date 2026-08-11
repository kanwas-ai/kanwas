import { HttpContext } from '@adonisjs/core/http'
import { validate as validateUuid } from 'uuid'
import Workspace from 'backend/models/workspace'

export default class AdminEmbedTemplatesController {
  /**
   * GET /admin/api/embed-templates — list workspaces flagged as embed templates
   */
  async index({}: HttpContext) {
    const templates = await Workspace.query().where('is_embed_template', true).orderBy('createdAt', 'desc')

    return templates.map((w) => ({
      id: w.id,
      name: w.name,
      organizationId: w.organizationId,
      createdAt: w.createdAt?.toISO(),
      updatedAt: w.updatedAt?.toISO(),
    }))
  }

  /**
   * POST /admin/api/embed-templates — flag an existing workspace as embed template
   */
  async store({ request, response }: HttpContext) {
    const workspaceId = String(request.input('workspaceId', '')).trim()
    if (!validateUuid(workspaceId)) {
      return response.badRequest({ error: 'workspaceId must be a UUID' })
    }

    const workspace = await Workspace.find(workspaceId)
    if (!workspace) {
      return response.notFound({ error: 'Workspace not found' })
    }

    workspace.isEmbedTemplate = true
    await workspace.save()

    return {
      id: workspace.id,
      name: workspace.name,
      organizationId: workspace.organizationId,
      createdAt: workspace.createdAt?.toISO(),
      updatedAt: workspace.updatedAt?.toISO(),
    }
  }

  /**
   * DELETE /admin/api/embed-templates/:id — clear the embed template flag
   */
  async destroy({ params, response }: HttpContext) {
    const workspace = await Workspace.find(params.id)
    if (!workspace) {
      return response.notFound({ error: 'Workspace not found' })
    }

    workspace.isEmbedTemplate = false
    await workspace.save()

    return { ok: true }
  }
}
