import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import MarvinConfigService from '#services/marvin_config_service'

function getPayloadKeys(payload: unknown): string[] | null {
  if (payload === null || payload === undefined) {
    return []
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  return Object.keys(payload)
}

@inject()
export default class MarvinConfigController {
  constructor(private marvinConfigService: MarvinConfigService) {}

  async show({ auth, params }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const config = await this.marvinConfigService.getConfig(user.id, workspaceId)
    const defaults = this.marvinConfigService.getDefaults()

    return {
      config,
      defaults,
      workspaceId,
    }
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id
    const payloadKeys = getPayloadKeys(request.body())

    if (payloadKeys === null) {
      return response.unprocessableEntity({
        error: 'Marvin config updates must be a JSON object',
      })
    }

    if (payloadKeys.length > 0) {
      return response.unprocessableEntity({
        error: 'No Marvin settings are currently available',
        unknownKeys: payloadKeys,
      })
    }

    const config = await this.marvinConfigService.updateConfig(user.id, workspaceId)

    return { config }
  }
}
