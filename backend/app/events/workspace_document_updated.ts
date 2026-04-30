import Workspace from '#models/workspace'
import { BaseEvent } from '@adonisjs/core/events'

export default class WorkspaceDocumentUpdated extends BaseEvent {
  constructor(public workspace: Workspace) {
    super()
  }
}
