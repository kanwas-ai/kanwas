import { z } from 'zod'

// =============================================================================
// Zod Schemas (for validation)
// =============================================================================

/**
 * Skill name validation
 * - Max 64 characters
 * - Lowercase letters, numbers, hyphens only
 * - Cannot start/end with hyphen
 * - No consecutive hyphens
 */
export const skillNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(64, 'Name must be 64 characters or less')
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Name must be lowercase letters, numbers, and hyphens. Cannot start/end with hyphen or have consecutive hyphens.'
  )
  .refine(
    (name) => !['anthropic', 'claude'].includes(name.toLowerCase()),
    'Name cannot be a reserved word (anthropic, claude)'
  )

/**
 * Skill description validation
 * - Non-empty
 * - Max 1024 characters
 */
export const skillDescriptionSchema = z
  .string()
  .min(1, 'Description is required')
  .max(1024, 'Description must be 1024 characters or less')

/**
 * Skill metadata schema (YAML frontmatter)
 */
export const skillMetadataSchema = z.object({
  'name': skillNameSchema,
  'description': skillDescriptionSchema,
  'license': z.string().optional(),
  'compatibility': z.string().max(500).optional(),
  'metadata': z.record(z.unknown()).optional(),
  'allowed-tools': z.string().optional(), // Space-delimited list
  'featured': z.boolean().optional(), // Featured skills shown prominently in UI
})

/**
 * Complete parsed skill
 */
export const parsedSkillSchema = z.object({
  metadata: skillMetadataSchema,
  body: z.string(),
})

/**
 * Stored skill (in yDoc)
 */
export const storedSkillSchema = z.object({
  metadata: skillMetadataSchema,
  body: z.string(),
  references: z.record(z.string()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
})

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type SkillName = z.infer<typeof skillNameSchema>
export type SkillDescription = z.infer<typeof skillDescriptionSchema>
export type SkillMetadata = z.infer<typeof skillMetadataSchema>
export type ParsedSkill = z.infer<typeof parsedSkillSchema>
export type StoredSkill = z.infer<typeof storedSkillSchema>

// =============================================================================
// Additional Interfaces
// =============================================================================

/**
 * Result of parsing a SKILL.md file
 */
export interface SkillParseResult {
  success: true
  skill: ParsedSkill
}

export interface SkillParseError {
  success: false
  error: string
  details?: z.ZodError
}

export type SkillParseOutcome = SkillParseResult | SkillParseError

/**
 * Validation result
 */
export interface SkillValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Skill summary for tool description
 */
export interface SkillSummary {
  name: string
  description: string
}

/**
 * Skill activation context
 */
export interface SkillActivation {
  skill: StoredSkill
  args?: string
  activatedAt: number
}
