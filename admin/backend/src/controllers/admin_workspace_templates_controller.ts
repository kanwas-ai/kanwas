import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import DefaultWorkspaceTemplateService, {
  InvalidDefaultWorkspaceTemplateError,
  UnsupportedDefaultWorkspaceTemplateError,
} from 'backend/services/default-workspace-template'

@inject()
export default class AdminWorkspaceTemplatesController {
  constructor(private defaultWorkspaceTemplateService: DefaultWorkspaceTemplateService) {}

  async show() {
    return {
      template: await this.defaultWorkspaceTemplateService.getActiveTemplateMetadata(),
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      const file = this.defaultWorkspaceTemplateService.parsePortableTemplateFile(request.body())
      const template = await this.defaultWorkspaceTemplateService.replaceActiveTemplate(file)

      return {
        template: this.defaultWorkspaceTemplateService.serializeMetadata(template),
      }
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

  async destroy() {
    await this.defaultWorkspaceTemplateService.clearActiveTemplate()
    return { template: null }
  }
}
