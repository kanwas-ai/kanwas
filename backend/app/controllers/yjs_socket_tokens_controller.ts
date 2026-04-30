import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import YjsSocketTokenService from '#services/yjs_socket_token_service'

@inject()
export default class YjsSocketTokensController {
  constructor(private tokenService: YjsSocketTokenService) {}

  async store({ auth, params }: HttpContext) {
    const user = auth.getUserOrFail()
    return this.tokenService.mint({
      workspaceId: params.id,
      userId: user.id,
      mode: 'editable',
    })
  }
}
