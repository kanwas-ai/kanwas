import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UserConfigService from '#services/user_config_service'
import vine from '@vinejs/vine'

const updateConfigValidator = vine.compile(
  vine.object({
    dismissedTipIds: vine.array(vine.string()).optional(),
  })
)

@inject()
export default class UserConfigController {
  constructor(private userConfigService: UserConfigService) {}

  /**
   * GET /user-config
   * Returns global user config (not workspace-scoped)
   */
  async show({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await this.userConfigService.getConfig(user.id)
    return { config }
  }

  /**
   * PATCH /user-config
   * Update global user config
   */
  async update({ auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(updateConfigValidator)

    if (data.dismissedTipIds?.length) {
      await this.userConfigService.dismissTips(user.id, data.dismissedTipIds)
      const config = await this.userConfigService.getConfig(user.id)
      return { config }
    }

    const config = await this.userConfigService.updateConfig(user.id, data)
    return { config }
  }
}
