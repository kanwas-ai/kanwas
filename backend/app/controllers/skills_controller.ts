import type { HttpContext } from '@adonisjs/core/http'
import Skill from '#models/skill'
import SkillPreference from '#models/skill_preference'
import { createSkillValidator, updateSkillValidator } from '#validators/skill'
import db from '@adonisjs/lucid/services/db'
import SkillService from '#services/skill_service'

/**
 * Helper to serialize a skill with enabled state for API response
 */
function serializeSkillWithEnabled(skill: Skill, enabled: boolean) {
  return {
    id: skill.id,
    userId: skill.userId,
    name: skill.name,
    description: skill.description,
    body: skill.body,
    metadata: skill.metadata,
    isSystem: skill.isSystem,
    enabled,
    createdAt: skill.createdAt.toISO(),
    updatedAt: skill.updatedAt?.toISO() ?? null,
  }
}

export default class SkillsController {
  /**
   * List all skills (system + user's own) with enabled state
   */
  async index({ auth }: HttpContext) {
    const user = auth.getUserOrFail()

    // Get all system skills and user's own skills
    const skills = await Skill.query()
      .where((query) => {
        query.where('is_system', true).orWhere('user_id', user.id)
      })
      .orderBy('is_system', 'desc')
      .orderBy('name', 'asc')

    // Get user's preferences
    const preferences = await SkillPreference.query().where('user_id', user.id)

    const prefMap = new Map(preferences.map((p) => [p.skillId, p.enabled]))

    // Combine skills with enabled state (default: true for system, true for user's own)
    return skills.map((skill) =>
      serializeSkillWithEnabled(skill, prefMap.has(skill.id) ? prefMap.get(skill.id)! : true)
    )
  }

  /**
   * Get single skill detail
   */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const skill = await Skill.find(params.id)

    if (!skill) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Check access: must be system skill or user's own
    if (!skill.isSystem && skill.userId !== user.id) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Get enabled state
    const pref = await SkillPreference.query().where('user_id', user.id).where('skill_id', skill.id).first()

    return serializeSkillWithEnabled(skill, pref?.enabled ?? true)
  }

  /**
   * Create a new user skill
   */
  async store({ request, auth, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const data = await request.validateUsing(createSkillValidator)

    // Check for reserved names
    if (['anthropic', 'claude'].includes(data.name.toLowerCase())) {
      return response.badRequest({ error: 'Skill name is reserved' })
    }

    // Check if user already has a skill with this name
    const existing = await Skill.query().where('user_id', user.id).where('name', data.name).first()

    if (existing) {
      return response.conflict({ error: 'You already have a skill with this name' })
    }

    const skill = await db.transaction(async (trx) => {
      return await Skill.create(
        {
          userId: user.id,
          name: data.name,
          body: data.body,
          metadata: { ...data.metadata, description: data.description },
          isSystem: false,
        },
        { client: trx }
      )
    })

    logger.info({ operation: 'skill_create', skillId: skill.id, skillName: skill.name }, 'Skill created')

    return serializeSkillWithEnabled(skill, true)
  }

  /**
   * Update user's own skill
   */
  async update({ params, request, auth, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const skill = await Skill.find(params.id)

    if (!skill) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Can only update own skills, not system skills
    if (skill.isSystem || skill.userId !== user.id) {
      return response.forbidden({ error: 'Cannot update this skill' })
    }

    const data = await request.validateUsing(updateSkillValidator)

    // Check reserved names if name is being changed
    if (data.name && ['anthropic', 'claude'].includes(data.name.toLowerCase())) {
      return response.badRequest({ error: 'Skill name is reserved' })
    }

    // Check for name conflict if name is being changed
    if (data.name && data.name !== skill.name) {
      const existing = await Skill.query()
        .where('user_id', user.id)
        .where('name', data.name)
        .whereNot('id', skill.id)
        .first()

      if (existing) {
        return response.conflict({ error: 'You already have a skill with this name' })
      }
    }

    // Update metadata with new description if provided
    const updatedMetadata = {
      ...skill.metadata,
      ...data.metadata,
      ...(data.description !== undefined ? { description: data.description } : {}),
    }

    skill.merge({
      name: data.name ?? skill.name,
      body: data.body ?? skill.body,
      metadata: updatedMetadata,
    })
    await skill.save()

    logger.info({ operation: 'skill_update', skillId: skill.id, skillName: skill.name }, 'Skill updated')

    const pref = await SkillPreference.query().where('user_id', user.id).where('skill_id', skill.id).first()

    return serializeSkillWithEnabled(skill, pref?.enabled ?? true)
  }

  /**
   * Delete user's own skill
   */
  async destroy({ params, auth, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const skill = await Skill.find(params.id)

    if (!skill) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Can only delete own skills, not system skills
    if (skill.isSystem || skill.userId !== user.id) {
      return response.forbidden({ error: 'Cannot delete this skill' })
    }

    await skill.delete()
    logger.info({ operation: 'skill_delete', skillId: params.id, skillName: skill.name }, 'Skill deleted')

    return { message: 'Skill deleted' }
  }

  /**
   * Enable a skill for the user
   */
  async enable({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const skill = await Skill.find(params.id)

    if (!skill) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Check access
    if (!skill.isSystem && skill.userId !== user.id) {
      return response.notFound({ error: 'Skill not found' })
    }

    await SkillPreference.updateOrCreate({ userId: user.id, skillId: skill.id }, { enabled: true })

    return serializeSkillWithEnabled(skill, true)
  }

  /**
   * Disable a skill for the user
   */
  async disable({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const skill = await Skill.find(params.id)

    if (!skill) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Check access
    if (!skill.isSystem && skill.userId !== user.id) {
      return response.notFound({ error: 'Skill not found' })
    }

    await SkillPreference.updateOrCreate({ userId: user.id, skillId: skill.id }, { enabled: false })

    return serializeSkillWithEnabled(skill, false)
  }

  /**
   * Duplicate a skill (creates a user-owned copy)
   * Works for both system skills and user's own skills
   */
  async duplicate({ params, auth, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const source = await Skill.find(params.id)

    if (!source) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Check access: must be system skill or user's own
    if (!source.isSystem && source.userId !== user.id) {
      return response.notFound({ error: 'Skill not found' })
    }

    // Generate unique name: skill-name-copy, skill-name-copy-2, etc.
    const baseName = source.name.replace(/-copy(-\d+)?$/, '')
    let newName = `${baseName}-copy`
    let counter = 1
    while (await Skill.query().where('user_id', user.id).where('name', newName).first()) {
      counter++
      newName = `${baseName}-copy-${counter}`
    }

    const newSkill = await Skill.create({
      userId: user.id,
      name: newName,
      body: source.body,
      metadata: source.metadata ?? {},
      isSystem: false,
    })

    logger.info({ operation: 'skill_duplicate', sourceId: source.id, newId: newSkill.id, newName }, 'Skill duplicated')

    return serializeSkillWithEnabled(newSkill, true)
  }

  /**
   * Get skill usage stats for the user
   */
  async stats({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const skillService = new SkillService()

    return skillService.getUsageStats(user.id)
  }
}
