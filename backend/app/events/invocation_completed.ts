import { BaseEvent } from '@adonisjs/core/events'
import type { EventContext } from '#contracts/event_context'

export interface InvocationCompletedPayload {
  invocationId: string
  workspaceId: string
  organizationId: string
  userId: string
  blocked: boolean
}

export default class InvocationCompleted extends BaseEvent {
  constructor(
    public payload: InvocationCompletedPayload,
    public context: EventContext
  ) {
    super()
  }
}
