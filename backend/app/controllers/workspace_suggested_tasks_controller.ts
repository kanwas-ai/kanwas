import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import WorkspaceSuggestedTaskService from '#services/workspace_suggested_task_service'
import { WorkspaceSuggestedTaskStateSchema } from '#validators/workspace_suggested_task'

@inject()
export default class WorkspaceSuggestedTasksController {
  constructor(private workspaceSuggestedTaskService: WorkspaceSuggestedTaskService) {}

  async index({ params }: HttpContext) {
    const state = await this.workspaceSuggestedTaskService.getState(params.id)
    return WorkspaceSuggestedTaskStateSchema.validate(state)
  }

  async destroy({ params }: HttpContext) {
    const state = await this.workspaceSuggestedTaskService.deleteSuggestion(params.id, params.suggestionId)
    return WorkspaceSuggestedTaskStateSchema.validate(state)
  }
}
