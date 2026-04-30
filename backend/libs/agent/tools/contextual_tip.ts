import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext, getToolCallId } from './context.js'

const CONTEXTUAL_TIP_IDS = ['voice_input', 'connect_tools', 'direct_mode_available'] as const

export const contextualTipTool = tool({
  description:
    'Surface a contextual UI tip. Available tips: "voice_input", "connect_tools", "direct_mode_available". Max 1 per response, call after your text.',
  inputSchema: z.object({
    tipId: z.enum(CONTEXTUAL_TIP_IDS).describe('The tip identifier.'),
    connector: z
      .string()
      .optional()
      .describe('For connect_tools: which connector to highlight (e.g., "slack", "github", "jira")'),
    label: z
      .string()
      .optional()
      .describe(
        'Short action label for the tip button (e.g., "Sync your Jira tickets", "Import Slack messages"). Keep it contextual and outcome-focused.'
      ),
  }),
  execute: async ({ tipId, connector, label }, execContext) => {
    const { state, agent } = getToolContext(execContext)
    const toolCallId = getToolCallId(execContext)

    const dismissed = state.currentContext.dismissedTipIds ?? []
    if (dismissed.includes(tipId)) return 'Tip already dismissed by user'

    if (tipId === 'direct_mode_available' && state.currentContext.agentMode !== 'thinking') {
      return 'Direct mode tip is only available in thinking mode'
    }

    // Max 1 tip per agent turn — only check tips after the last user message
    const timeline = state.getTimeline()
    let lastUserMsgIdx = -1
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      if (timeline[index]?.type === 'user_message') {
        lastUserMsgIdx = index
        break
      }
    }
    const currentTurnTip = timeline.slice(lastUserMsgIdx + 1).find((i) => i.type === 'contextual_tip')
    if (currentTurnTip) return 'Tip already shown this turn'

    state.addTimelineItem(
      {
        type: 'contextual_tip',
        tipId,
        connector,
        label,
        timestamp: Date.now(),
        agent,
      },
      'contextual_tip',
      toolCallId
    )

    return `Tip shown`
  },
})
