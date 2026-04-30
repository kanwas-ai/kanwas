import Invocation from '#models/invocation'
import { startAgentTracker } from '#tests/helpers/start_agent_tracker'

const TERMINAL_AGENT_EVENTS = new Set(['execution_completed', 'execution_interrupted', 'error'])

type WaitOptions = {
  timeoutMs?: number
  pollIntervalMs?: number
  acceptedEvents?: string[]
}

export async function waitForInvocationCompletion(invocationId: string, options: WaitOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 5000
  const pollIntervalMs = options.pollIntervalMs ?? 50
  const acceptedEvents = options.acceptedEvents ?? ['execution_completed', 'execution_interrupted', 'error']
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const invocation = await Invocation.find(invocationId)
    const eventType = invocation?.agentState?.event?.type

    if (eventType && acceptedEvents.includes(eventType)) {
      if (TERMINAL_AGENT_EVENTS.has(eventType)) {
        await startAgentTracker.flushInvocation(invocationId)
        return (await Invocation.find(invocationId)) ?? invocation
      }

      return invocation
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Timed out waiting for invocation ${invocationId} completion`)
}
