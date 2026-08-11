import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import LlmDefaultConfigService, { InvalidLlmDefaultConfigError } from 'backend/services/llm-defaults'

@inject()
export default class LlmDefaultsController {
  constructor(private llmDefaultConfigService: LlmDefaultConfigService) {}

  async show() {
    return {
      config: await this.llmDefaultConfigService.getConfig(),
    }
  }

  async update({ request, response }: HttpContext) {
    try {
      return {
        config: await this.llmDefaultConfigService.updateConfig(request.body()),
      }
    } catch (error) {
      if (error instanceof InvalidLlmDefaultConfigError) {
        return response.badRequest({ error: error.message })
      }

      throw error
    }
  }
}
