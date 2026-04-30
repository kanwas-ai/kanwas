import Invocation from '#models/invocation'
import { DateTime } from 'luxon'

// Invocations not updated in this many minutes are considered stale
const STALE_TIMEOUT_MINUTES = 15

/**
 * Service for invocation-related operations.
 * Provides reusable patterns like checking for active agents.
 */
export default class InvocationService {
  /**
   * Check if there's an active agent running for a workspace.
   * An agent is considered active if:
   * - It has started (agentState is not null)
   * - It hasn't completed (timeline doesn't end with execution_completed)
   * - It was updated recently (within STALE_TIMEOUT_MINUTES)
   *
   * @returns The active invocation if one exists, null otherwise
   */
  static async getActiveInvocation(workspaceId: string): Promise<Invocation | null> {
    // Get recent invocations for this workspace that have started
    const invocations = await Invocation.query()
      .where('workspace_id', workspaceId)
      .whereNotNull('agent_state')
      .orderBy('created_at', 'desc')
      .limit(10) // Only check recent ones for performance

    for (const invocation of invocations) {
      if (this.isInvocationActive(invocation)) {
        return invocation
      }
    }

    return null
  }

  /**
   * Check if a specific invocation is still active (not completed or errored).
   * Also considers invocations stale if not updated recently.
   */
  static isInvocationActive(invocation: Invocation): boolean {
    const state = invocation.agentState
    if (!state) return false

    // Check if invocation is stale (not updated recently)
    const staleThreshold = DateTime.now().minus({ minutes: STALE_TIMEOUT_MINUTES })
    if (invocation.updatedAt < staleThreshold) {
      return false
    }

    const timeline = state.state?.timeline
    if (!timeline || timeline.length === 0) {
      // Agent started but no timeline yet - consider active
      return true
    }

    // Check if the last item indicates completion
    const lastItem = timeline[timeline.length - 1]
    const terminalTypes = ['execution_completed', 'error', 'execution_interrupted']

    return !terminalTypes.includes(lastItem.type)
  }

  /**
   * Check if workspace has an active agent.
   * Convenience method that returns boolean.
   */
  static async hasActiveAgent(workspaceId: string): Promise<boolean> {
    const active = await this.getActiveInvocation(workspaceId)
    return active !== null
  }
}
