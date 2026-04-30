import StartAgent from '#listeners/start_agent'
import AgentInvoked from '#events/agent_invoked'
import { inject } from '@adonisjs/core'

// Track in-flight StartAgent handlers during tests so teardown can
// await async agent work before truncating tables.
class StartAgentTracker {
  private inFlight = new Set<Promise<unknown>>()
  private inFlightByInvocationId = new Map<string, Set<Promise<unknown>>>()

  track<T>(invocationId: string, promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise)

    let invocationPromises = this.inFlightByInvocationId.get(invocationId)
    if (!invocationPromises) {
      invocationPromises = new Set<Promise<unknown>>()
      this.inFlightByInvocationId.set(invocationId, invocationPromises)
    }

    invocationPromises.add(promise)

    promise.finally(() => {
      this.inFlight.delete(promise)

      const trackedPromises = this.inFlightByInvocationId.get(invocationId)
      if (!trackedPromises) {
        return
      }

      trackedPromises.delete(promise)
      if (trackedPromises.size === 0) {
        this.inFlightByInvocationId.delete(invocationId)
      }
    })

    return promise
  }

  async flush(): Promise<void> {
    while (this.inFlight.size > 0) {
      const pending = Array.from(this.inFlight)
      await Promise.allSettled(pending)
    }
  }

  async flushInvocation(invocationId: string): Promise<void> {
    while (true) {
      const pending = Array.from(this.inFlightByInvocationId.get(invocationId) ?? [])
      if (pending.length === 0) {
        return
      }

      await Promise.allSettled(pending)
    }
  }
}

export const startAgentTracker = new StartAgentTracker()

@inject()
export class TrackedStartAgent extends StartAgent {
  async handle(event: AgentInvoked) {
    return startAgentTracker.track(event.invocation.id, super.handle(event))
  }
}
