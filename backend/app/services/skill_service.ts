import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import Skill from '#models/skill'
import SkillPreference from '#models/skill_preference'
import SkillUsage, { type SkillUsageSource } from '#models/skill_usage'
import { parseSkillMd } from 'shared'

/**
 * Skill summary for LLM tool description
 */
export interface SkillSummary {
  name: string
  description: string
}

/**
 * Internal type for skills with version tracking data
 */
interface SkillWithVersion {
  id: string
  name: string
  description: string
  updatedAt: DateTime | null
}

/**
 * Skill data returned by service methods
 */
export interface SkillData {
  id: string
  name: string
  description: string
  body: string
  metadata: Record<string, unknown>
  isSystem: boolean
}

/**
 * Service for managing skills stored in the database.
 * Skills can be system-wide (isSystem=true) or user-created (userId set).
 * User preferences control which skills are enabled for each user.
 */
export default class SkillService {
  /**
   * Get all enabled skills for a user.
   * Returns system skills that user hasn't disabled, plus user's own skills that are enabled.
   *
   * When a user skill and system skill share the same name, only the user skill is returned
   * (the user skill "shadows" the system skill).
   */
  async listEnabledSkills(userId: string): Promise<SkillSummary[]> {
    // Handle empty userId - only return system skills
    if (!userId) {
      const systemSkills = await Skill.query().where('is_system', true)
      return systemSkills.map((s) => ({ name: s.name, description: s.description }))
    }

    // Get all skills with user's preferences
    const skills = await Skill.query()
      .where((query) => {
        query.where('is_system', true).orWhere('user_id', userId)
      })
      .preload('preferences', (query) => {
        query.where('user_id', userId)
      })

    // Filter to enabled skills only, deduplicating by name (user skills shadow system skills)
    const skillsByName = new Map<string, SkillSummary>()

    for (const skill of skills) {
      const preference = skill.preferences[0]
      // System skills default to enabled, user skills default to enabled
      const isEnabled = preference?.enabled ?? true

      if (!isEnabled) {
        continue
      }

      const existing = skillsByName.get(skill.name)
      if (existing) {
        // If we already have this name, only replace if the new one is a user skill
        // (user skills take priority over system skills)
        if (!skill.isSystem) {
          skillsByName.set(skill.name, {
            name: skill.name,
            description: skill.description,
          })
        }
        // Otherwise keep the existing (which may be user or system)
      } else {
        skillsByName.set(skill.name, {
          name: skill.name,
          description: skill.description,
        })
      }
    }

    return Array.from(skillsByName.values())
  }

  /**
   * Get a single enabled skill by name for a user.
   * Returns null if skill doesn't exist or is disabled.
   *
   * Priority: User-owned skill > System skill
   * This ensures that if a user creates a skill with the same name as a system
   * skill, the user's skill is returned (even if the system skill is disabled).
   */
  async getSkill(userId: string, name: string): Promise<SkillData | null> {
    // Get all matching skills (user's own and system) with preferences
    const skills = await Skill.query()
      .where('name', name)
      .where((query) => {
        query.where('is_system', true).orWhere('user_id', userId)
      })
      .preload('preferences', (query) => {
        query.where('user_id', userId)
      })

    if (skills.length === 0) {
      return null
    }

    // Prioritize user-owned skill over system skill
    const userSkill = skills.find((s) => s.userId === userId)
    const systemSkill = skills.find((s) => s.isSystem)
    const skill = userSkill ?? systemSkill

    if (!skill) {
      return null
    }

    // Check if enabled
    const preference = skill.preferences[0]
    const isEnabled = preference?.enabled ?? true

    if (!isEnabled) {
      return null
    }

    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      body: skill.body,
      metadata: skill.metadata,
      isSystem: skill.isSystem,
    }
  }

  /**
   * Import a skill from SKILL.md content for a user.
   * Creates a new skill owned by the user.
   */
  async importSkill(
    userId: string,
    content: string
  ): Promise<{ success: true; skillId: string; name: string } | { success: false; error: string }> {
    const result = parseSkillMd(content)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Check if user already has a skill with this name
    const existing = await Skill.query().where('name', result.skill.metadata.name).where('user_id', userId).first()

    // Extract name from metadata, keep rest (including description) in metadata
    const { name, ...metadata } = result.skill.metadata

    if (existing) {
      // Update existing skill
      existing.body = result.skill.body
      existing.metadata = metadata as Record<string, unknown>
      await existing.save()

      return { success: true, skillId: existing.id, name: existing.name }
    }

    // Create new skill
    const skill = await Skill.create({
      userId,
      name,
      body: result.skill.body,
      metadata: metadata as Record<string, unknown>,
      isSystem: false,
    })

    // Enable the skill by default
    await SkillPreference.create({
      userId,
      skillId: skill.id,
      enabled: true,
    })

    return { success: true, skillId: skill.id, name: skill.name }
  }

  /**
   * Generate skill tool description for LLM.
   * Now a simple description - skills are listed in the system prompt instead.
   */
  getSkillToolDescription(): string {
    return `Execute a skill by name. Skills extend your capabilities with specialized instructions for specific tasks. The skill's full instructions will be loaded when invoked. Check the system prompt for available skills.`
  }

  /**
   * Generate skill descriptions for inclusion in system prompt.
   * Returns formatted text ready to be appended to the base prompt.
   * Returns null if no skills are enabled.
   *
   * Includes a version hash that changes when skills are added, removed, or edited.
   * This ensures Anthropic's prompt cache is invalidated when skills change.
   */
  async getSkillDescriptionsForPrompt(userId: string): Promise<string | null> {
    const skills = await this.listEnabledSkillsWithVersions(userId)

    if (skills.length === 0) {
      return null
    }

    // Compute version hash from skill IDs and updatedAt timestamps
    // This changes when skills are toggled, added, removed, or edited
    const versionHash = this.computeSkillsVersionHash(skills)

    const skillList = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n')

    return `## Skills

You have access to specialized skills that extend your capabilities. When a skill is relevant to the user's request, use the \`skill\` tool to invoke it by name.

**Available Skills:**
${skillList}

Skills provide detailed instructions for specific tasks. When invoked, the full skill content loads into context to guide your actions.

<!-- skills-version: ${versionHash} -->`
  }

  /**
   * Get all enabled skills with version tracking data.
   * Used internally to compute the version hash for cache invalidation.
   */
  private async listEnabledSkillsWithVersions(userId: string): Promise<SkillWithVersion[]> {
    // Handle empty userId - only return system skills
    if (!userId) {
      const systemSkills = await Skill.query().where('is_system', true)
      return systemSkills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        updatedAt: s.updatedAt,
      }))
    }

    // Get all skills with user's preferences
    const skills = await Skill.query()
      .where((query) => {
        query.where('is_system', true).orWhere('user_id', userId)
      })
      .preload('preferences', (query) => {
        query.where('user_id', userId)
      })

    // Filter to enabled skills only, deduplicating by name (user skills shadow system skills)
    const skillsByName = new Map<string, SkillWithVersion>()

    for (const skill of skills) {
      const preference = skill.preferences[0]
      // System skills default to enabled, user skills default to enabled
      const isEnabled = preference?.enabled ?? true

      if (!isEnabled) {
        continue
      }

      const existing = skillsByName.get(skill.name)
      if (existing) {
        // If we already have this name, only replace if the new one is a user skill
        // (user skills take priority over system skills)
        if (!skill.isSystem) {
          skillsByName.set(skill.name, {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            updatedAt: skill.updatedAt,
          })
        }
        // Otherwise keep the existing (which may be user or system)
      } else {
        skillsByName.set(skill.name, {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          updatedAt: skill.updatedAt,
        })
      }
    }

    return Array.from(skillsByName.values())
  }

  /**
   * Compute a short hash representing the current state of enabled skills.
   * Changes when skills are added, removed, toggled, or edited.
   */
  private computeSkillsVersionHash(skills: SkillWithVersion[]): string {
    // Sort by ID for consistent ordering
    const sorted = [...skills].sort((a, b) => a.id.localeCompare(b.id))

    // Create a string representing the current state
    const stateString = sorted.map((s) => `${s.id}:${s.updatedAt?.toISO() ?? 'null'}`).join('|')

    // Create a short hash (first 8 chars of SHA-256)
    return createHash('sha256').update(stateString).digest('hex').slice(0, 8)
  }

  /**
   * Log skill usage for analytics.
   * Called when a skill is invoked via slash command or agent tool.
   */
  async logUsage(params: {
    userId: string
    skillId: string | null
    skillName: string
    workspaceId: string
    conversationId: string
    source: SkillUsageSource
  }): Promise<void> {
    await SkillUsage.create({
      userId: params.userId,
      skillId: params.skillId,
      skillName: params.skillName,
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      source: params.source,
      invokedAt: DateTime.now(),
    })
  }

  /**
   * Get skill usage stats for a user.
   * Returns aggregated counts per skill.
   */
  async getUsageStats(userId: string): Promise<
    {
      skillName: string
      skillId: string | null
      totalCount: number
      commandCount: number
      agentCount: number
      lastUsedAt: string | null
    }[]
  > {
    const rawStats = await SkillUsage.query()
      .where('user_id', userId)
      .select('skill_name', 'skill_id')
      .select(
        SkillUsage.query().client.raw('COUNT(*) as total_count'),
        SkillUsage.query().client.raw("COUNT(*) FILTER (WHERE source = 'command') as command_count"),
        SkillUsage.query().client.raw("COUNT(*) FILTER (WHERE source = 'agent') as agent_count"),
        SkillUsage.query().client.raw('MAX(invoked_at) as last_used_at')
      )
      .groupBy('skill_name', 'skill_id')
      .orderByRaw('COUNT(*) DESC')

    return rawStats.map((row) => ({
      skillName: row.skillName,
      skillId: row.skillId,
      totalCount: Number(row.$extras.total_count),
      commandCount: Number(row.$extras.command_count),
      agentCount: Number(row.$extras.agent_count),
      lastUsedAt: row.$extras.last_used_at ? String(row.$extras.last_used_at) : null,
    }))
  }
}
