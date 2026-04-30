import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext } from './context.js'
import SkillService from '#services/skill_service'

/**
 * Create the skill tool.
 * The tool description is dynamically generated based on available skills.
 */
export function createSkillTool(description: string) {
  return tool({
    description,
    inputSchema: z.object({
      skill: z.string().describe('The name of the skill to execute'),
      args: z.string().optional().describe('Optional arguments for the skill'),
    }),
    execute: async ({ skill: skillName, args }: { skill: string; args?: string }, execContext: unknown) => {
      const { state, userId } = getToolContext(execContext)
      const { workspaceId, invocationId } = state.currentContext

      const skillService = new SkillService()
      const skill = await skillService.getSkill(userId, skillName)

      if (!skill) {
        return `Error: Skill "${skillName}" not found or not enabled. Check the available skills in the system prompt.`
      }

      // Determine if this was a command or agent decision
      // Check if the last user message starts with "/skill " (command invocation)
      const timeline = state.getTimeline()
      const lastUserMessage = [...timeline].reverse().find((item) => item.type === 'user_message')
      const isCommand =
        lastUserMessage &&
        'message' in lastUserMessage &&
        typeof lastUserMessage.message === 'string' &&
        lastUserMessage.message.trim().startsWith('/skill ')

      // Log skill usage for analytics
      await skillService.logUsage({
        userId,
        skillId: skill.id,
        skillName: skill.name,
        workspaceId,
        conversationId: invocationId,
        source: isCommand ? 'command' : 'agent',
      })

      // Add skill activation to timeline
      state.addTimelineItem(
        {
          type: 'skill_activated',
          skillName: skill.name,
          skillDescription: skill.description,
          args,
          timestamp: Date.now(),
        },
        'skill_activated'
      )

      // Return skill body as context for the agent
      let result = `<skill name="${skill.name}">\n${skill.body}\n</skill>`

      if (args) {
        result += `\n\n<skill-args>${args}</skill-args>`
      }

      return result
    },
  })
}

/**
 * Get the skill tool description.
 * Now a simple description - skills are listed in the system prompt instead.
 */
export function getSkillToolDescription(): string {
  const skillService = new SkillService()
  return skillService.getSkillToolDescription()
}
