import yaml from 'yaml'
import type { SkillParseOutcome, ParsedSkill } from './types.js'
import { parsedSkillSchema } from './types.js'

/**
 * Parse a SKILL.md file content into structured skill data
 *
 * @param content - Raw SKILL.md file content
 * @returns Parsed skill or error
 */
export function parseSkillMd(content: string): SkillParseOutcome {
  // Extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return {
      success: false,
      error: 'Invalid SKILL.md format. Must start with YAML frontmatter (---)',
    }
  }

  const [, frontmatterYaml, body] = frontmatterMatch

  // Parse YAML
  let metadata: unknown
  try {
    metadata = yaml.parse(frontmatterYaml)
  } catch (e) {
    return {
      success: false,
      error: `Invalid YAML frontmatter: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // Validate with Zod schema
  const result = parsedSkillSchema.safeParse({
    metadata,
    body: body.trim(),
  })

  if (!result.success) {
    return {
      success: false,
      error: 'Validation failed',
      details: result.error,
    }
  }

  return {
    success: true,
    skill: result.data,
  }
}

/**
 * Serialize a skill back to SKILL.md format
 */
export function serializeSkillMd(skill: ParsedSkill): string {
  const frontmatter = yaml.stringify(skill.metadata)
  return `---\n${frontmatter}---\n\n${skill.body}`
}
