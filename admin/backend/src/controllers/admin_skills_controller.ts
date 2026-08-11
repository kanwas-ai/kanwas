import type { HttpContext } from '@adonisjs/core/http'
import Skill from 'backend/models/skill'

const SKILL_CATEGORIES = ['craft', 'framework', 'workflow', 'custom'] as const
const RESERVED_SKILL_NAMES = new Set(['anthropic', 'claude', 'openai'])
const ALLOWED_PAYLOAD_FIELDS = new Set(['name', 'description', 'body', 'category', 'featured', 'metadata'])
const CONTROLLED_METADATA_FIELDS = new Set(['name', 'description', 'category', 'featured'])

type SkillCategory = (typeof SKILL_CATEGORIES)[number]

interface AdminSkillInput {
  name?: string
  description?: string
  body?: string
  category?: SkillCategory
  featured?: boolean
  metadata?: Record<string, unknown>
}

type ValidationResult = { ok: true; data: AdminSkillInput } | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isSkillCategory(value: string): value is SkillCategory {
  return (SKILL_CATEGORIES as readonly string[]).includes(value)
}

function normalizeCategory(value: unknown): SkillCategory {
  return typeof value === 'string' && isSkillCategory(value) ? value : 'custom'
}

function sanitizeExtraMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (!CONTROLLED_METADATA_FIELDS.has(key)) {
      sanitized[key] = value
    }
  }
  return sanitized
}

function buildSkillMetadata(existing: Record<string, unknown>, input: AdminSkillInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...existing,
    ...(input.metadata ? sanitizeExtraMetadata(input.metadata) : {}),
  }

  delete metadata.name

  if (input.description !== undefined) metadata.description = input.description
  if (input.category !== undefined) metadata.category = input.category
  if (input.featured !== undefined) metadata.featured = input.featured

  return metadata
}

function validateSkillPayload(payload: unknown, options: { partial: boolean }): ValidationResult {
  if (!isPlainObject(payload)) {
    return { ok: false, error: 'Request body must be an object' }
  }

  const unsupportedFields = Object.keys(payload).filter((field) => !ALLOWED_PAYLOAD_FIELDS.has(field))
  if (unsupportedFields.length > 0) {
    return { ok: false, error: `Unsupported skill fields: ${unsupportedFields.join(', ')}` }
  }

  const data: AdminSkillInput = {}

  if (hasOwn(payload, 'name')) {
    if (typeof payload.name !== 'string') return { ok: false, error: 'name must be a string' }
    const name = payload.name.trim()
    if (!name) return { ok: false, error: 'name is required' }
    if (name.length > 64) return { ok: false, error: 'name must be 64 characters or less' }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      return { ok: false, error: 'name must be lowercase letters, numbers, and hyphens' }
    }
    if (RESERVED_SKILL_NAMES.has(name.toLowerCase())) {
      return { ok: false, error: 'name cannot be a reserved word' }
    }
    data.name = name
  } else if (!options.partial) {
    return { ok: false, error: 'name is required' }
  }

  if (hasOwn(payload, 'description')) {
    if (typeof payload.description !== 'string') return { ok: false, error: 'description must be a string' }
    const description = payload.description.trim()
    if (!description) return { ok: false, error: 'description is required' }
    if (description.length > 1024) return { ok: false, error: 'description must be 1024 characters or less' }
    data.description = description
  } else if (!options.partial) {
    return { ok: false, error: 'description is required' }
  }

  if (hasOwn(payload, 'body')) {
    if (typeof payload.body !== 'string') return { ok: false, error: 'body must be a string' }
    const body = payload.body.trim()
    if (!body) return { ok: false, error: 'body is required' }
    data.body = body
  } else if (!options.partial) {
    return { ok: false, error: 'body is required' }
  }

  if (hasOwn(payload, 'category')) {
    if (typeof payload.category !== 'string' || !isSkillCategory(payload.category)) {
      return { ok: false, error: `category must be one of: ${SKILL_CATEGORIES.join(', ')}` }
    }
    data.category = payload.category
  } else if (!options.partial) {
    data.category = 'custom'
  }

  if (hasOwn(payload, 'featured')) {
    if (typeof payload.featured !== 'boolean') return { ok: false, error: 'featured must be a boolean' }
    data.featured = payload.featured
  } else if (!options.partial) {
    data.featured = false
  }

  if (hasOwn(payload, 'metadata')) {
    if (!isPlainObject(payload.metadata)) return { ok: false, error: 'metadata must be an object' }
    data.metadata = payload.metadata
  } else if (!options.partial) {
    data.metadata = {}
  }

  return { ok: true, data }
}

function serializeAdminSkill(skill: Skill) {
  const metadata = skill.metadata ?? {}

  return {
    id: skill.id,
    userId: skill.userId,
    name: skill.name,
    description: skill.description,
    body: skill.body,
    metadata,
    isSystem: skill.isSystem,
    category: normalizeCategory(metadata.category),
    featured: metadata.featured === true,
    createdAt: skill.createdAt.toISO(),
    updatedAt: skill.updatedAt?.toISO() ?? null,
  }
}

export default class AdminSkillsController {
  async index() {
    const skills = await Skill.query().where('is_system', true).orderBy('name', 'asc')
    return skills.map(serializeAdminSkill)
  }

  async store({ request, response }: HttpContext) {
    const validation = validateSkillPayload(request.body(), { partial: false })
    if (!validation.ok) {
      return response.badRequest({ error: validation.error })
    }

    const data = validation.data
    const existing = await Skill.query().where('is_system', true).where('name', data.name!).first()
    if (existing) {
      return response.conflict({ error: 'A system skill with this name already exists' })
    }

    const skill = await Skill.create({
      userId: null,
      name: data.name!,
      body: data.body!,
      metadata: buildSkillMetadata({}, data),
      isSystem: true,
    })

    return serializeAdminSkill(skill)
  }

  async update({ params, request, response }: HttpContext) {
    const skill = await Skill.find(params.id)
    if (!skill || !skill.isSystem) {
      return response.notFound({ error: 'Skill not found' })
    }

    const validation = validateSkillPayload(request.body(), { partial: true })
    if (!validation.ok) {
      return response.badRequest({ error: validation.error })
    }

    const data = validation.data
    if (data.name && data.name !== skill.name) {
      const existing = await Skill.query()
        .where('is_system', true)
        .where('name', data.name)
        .whereNot('id', skill.id)
        .first()
      if (existing) {
        return response.conflict({ error: 'A system skill with this name already exists' })
      }
    }

    skill.merge({
      name: data.name ?? skill.name,
      body: data.body ?? skill.body,
      metadata: buildSkillMetadata(skill.metadata ?? {}, data),
    })
    await skill.save()

    return serializeAdminSkill(skill)
  }

  async destroy({ params, response }: HttpContext) {
    const skill = await Skill.find(params.id)
    if (!skill || !skill.isSystem) {
      return response.notFound({ error: 'Skill not found' })
    }

    await skill.delete()
    return { ok: true }
  }
}
