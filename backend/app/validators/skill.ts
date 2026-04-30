import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import './custom_types.js'

/**
 * Reserved skill names that cannot be used
 */
const RESERVED_SKILL_NAMES = ['anthropic', 'claude', 'openai']

/**
 * Custom rule to check for reserved skill names
 */
const notReservedName = vine.createRule((value: unknown, _, field: FieldContext) => {
  if (typeof value !== 'string') return
  if (RESERVED_SKILL_NAMES.includes(value.toLowerCase())) {
    field.report('The {{ field }} cannot be a reserved word (anthropic, claude, openai)', 'notReservedName', field)
  }
})

/**
 * Skill name validation
 * - Max 64 characters
 * - Lowercase letters, numbers, hyphens only
 * - Cannot start/end with hyphen
 * - No consecutive hyphens
 * - Cannot be reserved words (anthropic, claude, openai)
 */
const skillNameRule = vine
  .string()
  .trim()
  .minLength(1)
  .maxLength(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .use(notReservedName())

/**
 * Skill description validation
 * - Non-empty
 * - Max 1024 characters
 */
const skillDescriptionRule = vine.string().trim().minLength(1).maxLength(1024)

/**
 * Skill metadata (arbitrary key-value pairs from frontmatter)
 */
const skillMetadataRule = vine.record(vine.any()).optional()

export const createSkillValidator = vine.compile(
  vine.object({
    name: skillNameRule,
    description: skillDescriptionRule,
    body: vine.string().minLength(1),
    metadata: skillMetadataRule,
  })
)

export const updateSkillValidator = vine.compile(
  vine.object({
    name: skillNameRule.optional(),
    description: skillDescriptionRule.optional(),
    body: vine.string().minLength(1).optional(),
    metadata: skillMetadataRule,
  })
)

export const SkillSchema = vine.compile(
  vine.object({
    id: vine.string(),
    userId: vine.string().nullable(),
    name: vine.string(),
    description: vine.string(),
    body: vine.string(),
    metadata: vine.record(vine.any()),
    isSystem: vine.boolean(),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime().nullable(),
  })
)

/**
 * Response schema for skill with user's enabled state
 */
export const SkillWithEnabledSchema = vine.compile(
  vine.object({
    id: vine.string(),
    userId: vine.string().nullable(),
    name: vine.string(),
    description: vine.string(),
    body: vine.string(),
    metadata: vine.record(vine.any()),
    isSystem: vine.boolean(),
    enabled: vine.boolean(),
    createdAt: vine.luxonDateTime(),
    updatedAt: vine.luxonDateTime().nullable(),
  })
)
