import { BaseEvent } from '@adonisjs/core/events'

export default class ConnectionsCatalogRefreshRequested extends BaseEvent {
  constructor(public reason: 'stale' = 'stale') {
    super()
  }
}
