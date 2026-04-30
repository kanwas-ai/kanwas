import type { SkillValidationResult } from './types.js'
import { skillNameSchema, skillDescriptionSchema, skillMetadataSchema } from './types.js'

/**
 * Validate skill name
 */
export function validateSkillName(name: string): SkillValidationResult {
  const result = skillNameSchema.safeParse(name)
  return {
    valid: result.success,
    errors: result.success ? [] : result.error.errors.map((e) => e.message),
  }
}

/**
 * Validate skill description
 */
export function validateSkillDescription(description: string): SkillValidationResult {
  const result = skillDescriptionSchema.safeParse(description)
  return {
    valid: result.success,
    errors: result.success ? [] : result.error.errors.map((e) => e.message),
  }
}

/**
 * Validate complete skill metadata
 */
export function validateSkillMetadata(metadata: unknown): SkillValidationResult {
  const result = skillMetadataSchema.safeParse(metadata)
  return {
    valid: result.success,
    errors: result.success ? [] : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}

/**
 * Reserved words that cannot be used in skill names
 */
export const RESERVED_WORDS = ['anthropic', 'claude'] as const

/**
 * Check if a name is reserved
 */
export function isReservedName(name: string): boolean {
  return RESERVED_WORDS.includes(name.toLowerCase() as (typeof RESERVED_WORDS)[number])
}
