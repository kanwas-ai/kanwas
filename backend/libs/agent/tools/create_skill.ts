import { tool } from 'ai'
import { z } from 'zod'
import { getToolContext } from './context.js'
import SkillService from '#services/skill_service'

/**
 * Tool for the agent to create new skills.
 * Use when user asks to save a workflow, remember instructions, or create a reusable skill.
 */
export const createSkillTool = tool({
  description: `Create a new skill that can be invoked later. Use when user asks to:
- Save a workflow or process for reuse
- Remember instructions or procedures
- Create a custom automation
- Define a reusable command

The skill will be available to invoke via the skill tool or by typing /{skill-name} in chat.`,
  inputSchema: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Name must be lowercase with hyphens (e.g., my-skill-name)')
      .max(64, 'Name must be 64 characters or less')
      .describe('Unique skill name in kebab-case (e.g., weekly-standup, code-review)'),
    description: z
      .string()
      .max(1024, 'Description must be 1024 characters or less')
      .describe('Brief description of what the skill does (shown in skill list)'),
    body: z.string().describe('The instructions that will be executed when the skill is invoked'),
  }),
  execute: async (
    { name, description, body }: { name: string; description: string; body: string },
    execContext: unknown
  ) => {
    const { state, userId } = getToolContext(execContext)

    const skillService = new SkillService()

    // Format as SKILL.md content for importSkill
    const skillMd = `---
name: ${name}
description: ${description}
---

${body}`

    const result = await skillService.importSkill(userId, skillMd)

    if (!result.success) {
      return `Failed to create skill: ${result.error}`
    }

    // Add skill creation to timeline
    state.addTimelineItem(
      {
        type: 'skill_created',
        skillName: name,
        skillDescription: description,
        timestamp: Date.now(),
      },
      'skill_created'
    )

    return `Successfully created skill "${name}".

The user can now invoke it by:
- Typing /${name} in the chat
- Asking you to use the "${name}" skill

The skill contains the following instructions:
${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`
  },
})
