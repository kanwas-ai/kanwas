import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import DocumentShareService, { DocumentShareNotFoundError } from '#services/document_share_service'
import {
  createDocumentShareValidator,
  documentShareParamsValidator,
  publicDocumentShareParamsValidator,
  updateDocumentShareValidator,
} from '#validators/document_share'

@inject()
export default class DocumentSharesController {
  constructor(private documentShareService: DocumentShareService) {}

  async index({ params, correlationId }: HttpContext) {
    return this.documentShareService.listActiveSharesForWorkspace(params.id, { correlationId })
  }

  async show({ params, correlationId }: HttpContext) {
    const { noteId } = await documentShareParamsValidator.validate(params)
    return this.documentShareService.getOwnerShareState(params.id, noteId, { correlationId })
  }

  async store({ auth, params, request, correlationId }: HttpContext) {
    const user = auth.getUserOrFail()
    const { noteId } = await documentShareParamsValidator.validate(params)
    const data = await request.validateUsing(createDocumentShareValidator)

    return this.documentShareService.createOrUpdateShare(params.id, noteId, user.id, data.name, data.accessMode, {
      correlationId,
    })
  }

  async update({ params, request, response, correlationId }: HttpContext) {
    const { noteId } = await documentShareParamsValidator.validate(params)
    const data = await request.validateUsing(updateDocumentShareValidator)

    try {
      return await this.documentShareService.updateShare(params.id, noteId, data.name, data.accessMode, {
        correlationId,
      })
    } catch (error) {
      if (error instanceof DocumentShareNotFoundError) {
        return response.notFound({ error: error.message })
      }

      throw error
    }
  }

  async destroy({ params, correlationId }: HttpContext) {
    const { noteId } = await documentShareParamsValidator.validate(params)
    return this.documentShareService.revokeShare(params.id, noteId, { correlationId })
  }

  async resolvePublic({ params, response }: HttpContext) {
    const { longHashId } = await publicDocumentShareParamsValidator.validate(params)
    const result = await this.documentShareService.resolvePublicShare(longHashId)

    if (result.status === 'not_found') {
      return response.notFound(result)
    }

    if (result.status === 'revoked') {
      return response.status(410).send(result)
    }

    return result
  }

  async resolveSocketAccess({ params, response, correlationId }: HttpContext) {
    const { longHashId } = await publicDocumentShareParamsValidator.validate(params)
    const result = await this.documentShareService.resolveSocketShareAccess(longHashId, { correlationId })

    if (result.status === 'not_found') {
      return response.notFound(result)
    }

    if (result.status === 'revoked') {
      return response.status(410).send(result)
    }

    return result
  }
}
