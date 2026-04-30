import { BaseEvent } from '@adonisjs/core/events'

export default class InvocationSubscribed extends BaseEvent {
  /**
   * Accept event data as constructor parameters
   */
  constructor(
    public invocationId: string,
    public channel: string,
    public socketId?: string
  ) {
    super()
  }
}
