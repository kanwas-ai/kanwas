import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import GBrainService, { GBrainInvalidPathError, GBrainPageNotFoundError } from '#services/gbrain_service'
import { readGBrainPageValidator, searchGBrainValidator } from '#validators/gbrain'

@inject()
export default class GBrainController {
  constructor(private gbrainService: GBrainService) {}

  async search({ auth, request, response }: HttpContext) {
    auth.getUserOrFail()
    const data = await searchGBrainValidator.validate(request.qs())

    try {
      const results = await this.gbrainService.search({
        query: data.query,
        limit: data.limit ? Number(data.limit) : undefined,
      })

      return response.ok({ results })
    } catch (error) {
      if (error instanceof GBrainInvalidPathError) {
        return response.badRequest({ code: 'INVALID_GBRAIN_PATH', error: error.message })
      }

      throw error
    }
  }

  async show({ auth, request, response }: HttpContext) {
    auth.getUserOrFail()
    const { path } = await readGBrainPageValidator.validate(request.qs())

    try {
      const page = await this.gbrainService.readPage(path)
      return response.ok(page)
    } catch (error) {
      if (error instanceof GBrainInvalidPathError) {
        return response.badRequest({ code: 'INVALID_GBRAIN_PATH', error: error.message })
      }

      if (error instanceof GBrainPageNotFoundError) {
        return response.notFound({ code: 'GBRAIN_PAGE_NOT_FOUND', error: error.message })
      }

      throw error
    }
  }
}
