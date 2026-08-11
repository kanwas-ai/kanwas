import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import Workspace from '#models/workspace'
import WorkspaceDocumentUpdated from '#events/workspace_document_updated'

@inject()
export default class WorkspaceDocumentsController {
  /**
   * POST /workspaces/:id/document/updated
   * Notify backend that the Yjs server persisted latest document bytes
   */
  async notifyDocumentUpdated({ params, request, response, logger }: HttpContext) {
    const workspace = await Workspace.findOrFail(params.id)
    const source = request.input('source')

    WorkspaceDocumentUpdated.dispatch(workspace)

    logger.info(
      { operation: 'document_notify', workspaceId: workspace.id, source },
      'Document update notification received'
    )

    return response.ok({ success: true })
  }
}
