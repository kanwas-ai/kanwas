import TrackInvocationUsage from '#listeners/track_invocation_usage'
import InvocationCompleted from '#events/invocation_completed'
import { inject } from '@adonisjs/core'

class InvocationCompletedTracker {
  private inFlight = new Set<Promise<unknown>>()

  track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise)
    promise.finally(() => this.inFlight.delete(promise))
    return promise
  }

  async flush(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled(Array.from(this.inFlight))
    }
  }
}

export const invocationCompletedTracker = new InvocationCompletedTracker()

@inject()
export class TrackedTrackInvocationUsage extends TrackInvocationUsage {
  async handle(event: InvocationCompleted) {
    return invocationCompletedTracker.track(super.handle(event))
  }
}
