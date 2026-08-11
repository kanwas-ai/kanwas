import { BaseEvent } from '@adonisjs/core/events'
import type { EventContext } from '#contracts/event_context'

export type WorkspaceCreatedSource = 'manual_create' | 'onboarding' | 'duplicate' | 'embed_bootstrap'

export default class WorkspaceCreated extends BaseEvent {
  constructor(
    public workspaceId: string,
    public organizationId: string,
    public triggeringUserId: string,
    public source: WorkspaceCreatedSource,
    public context: EventContext
  ) {
    super()
  }
}
