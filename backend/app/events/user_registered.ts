import { BaseEvent } from '@adonisjs/core/events'
import type { EventContext } from '#contracts/event_context'

export type UserRegisteredSource = 'password' | 'google'

export default class UserRegistered extends BaseEvent {
  constructor(
    public userId: string,
    public email: string,
    public name: string,
    public source: UserRegisteredSource,
    public viaInvite: boolean,
    public context: EventContext
  ) {
    super()
  }
}
