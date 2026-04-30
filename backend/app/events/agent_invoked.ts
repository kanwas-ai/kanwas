import Invocation from '#models/invocation'
import { BaseEvent } from '@adonisjs/core/events'
import type { EventContext } from '#contracts/event_context'

export default class AgentInvoked extends BaseEvent {
  /**
   * Accept event data as constructor parameters
   */
  constructor(
    public invocation: Invocation,
    public context: EventContext
  ) {
    super()
  }
}
