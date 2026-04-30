import type { HttpContext } from '@adonisjs/core/http'
import { randomBytes } from 'node:crypto'
import redis from '@adonisjs/redis/services/main'
import User from '#models/user'
import { cliAuthorizeValidator, cliPollValidator } from '#validators/cli_auth'

const CLI_AUTH_PREFIX = 'cli:auth'
const CLI_AUTH_TTL = 300 // 5 minutes

function redisKey(code: string) {
  return `${CLI_AUTH_PREFIX}:${code}`
}

export default class CliAuthController {
  /**
   * Generate a new CLI auth code. Public endpoint.
   * POST /auth/cli/code
   */
  async createCode({ response }: HttpContext) {
    const code = randomBytes(4).toString('hex') // 8-char hex

    await redis.set(redisKey(code), JSON.stringify({ status: 'pending' }), 'EX', CLI_AUTH_TTL)

    return response.ok({ code, expiresIn: CLI_AUTH_TTL })
  }

  /**
   * Authorize a CLI auth code. Requires authenticated user (browser session).
   * POST /auth/cli/authorize
   */
  async authorize({ request, auth, response, logger }: HttpContext) {
    const { code } = await request.validateUsing(cliAuthorizeValidator)
    const user = auth.getUserOrFail()

    const raw = await redis.get(redisKey(code))
    if (!raw) {
      return response.notFound({ error: 'Code expired or invalid' })
    }

    const data = JSON.parse(raw)
    if (data.status !== 'pending') {
      return response.badRequest({ error: 'Code already used' })
    }

    // Create a long-lived CLI access token
    const accessToken = await User.accessTokens.create(user, ['*'], { name: 'CLI' })

    logger.info({ userId: user.id }, 'CLI token created')

    await redis.set(
      redisKey(code),
      JSON.stringify({
        status: 'approved',
        token: accessToken.value!.release(),
        userName: user.name,
        userEmail: user.email,
      }),
      'EX',
      CLI_AUTH_TTL
    )

    return response.ok({ success: true })
  }

  /**
   * Poll for CLI auth status. Public endpoint.
   * GET /auth/cli/poll?code=XXX
   */
  async poll({ request, response }: HttpContext) {
    const { code } = await cliPollValidator.validate(request.qs())

    const raw = await redis.get(redisKey(code))
    if (!raw) {
      return response.notFound({ error: 'Code expired or invalid' })
    }

    const data = JSON.parse(raw)

    if (data.status === 'pending') {
      return response.ok({ status: 'pending' })
    }

    if (data.status === 'approved') {
      // Delete key after successful retrieval
      await redis.del(redisKey(code))

      return response.ok({
        status: 'approved',
        token: data.token,
        user: {
          name: data.userName,
          email: data.userEmail,
        },
      })
    }

    return response.badRequest({ error: 'Unknown status' })
  }
}
