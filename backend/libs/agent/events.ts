import { EventEmitter } from 'node:events'
import type { AgentEvent } from './types.js'

// Re-export event types from types.ts
export type { AgentEvent, AgentEventType } from './types.js'

// Event Stream Manager
export class EventStream extends EventEmitter {
  constructor() {
    super()
  }

  emitEvent(event: AgentEvent): void {
    this.emit('agent_event', event)
  }
}
