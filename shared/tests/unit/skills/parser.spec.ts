import { describe, it, expect } from 'vitest'
import { parseSkillMd, serializeSkillMd } from '../../../src/skills/parser.js'

describe('parseSkillMd', () => {
  describe('valid inputs', () => {
    it('parses minimal valid SKILL.md', () => {
      const input = `---
name: test-skill
description: A test skill.
---

# Test Skill

Body content.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.skill.metadata.name).toBe('test-skill')
        expect(result.skill.metadata.description).toBe('A test skill.')
        expect(result.skill.body).toContain('# Test Skill')
      }
    })

    it('parses SKILL.md with all optional fields', () => {
      const input = `---
name: full-skill
description: Full featured skill.
license: MIT
compatibility: Claude Code compatible
metadata:
  author: test
  version: "1.0"
allowed-tools: Bash(git:*) Read
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.skill.metadata.license).toBe('MIT')
        expect(result.skill.metadata.compatibility).toBe('Claude Code compatible')
        expect(result.skill.metadata.metadata).toEqual({ author: 'test', version: '1.0' })
        expect(result.skill.metadata['allowed-tools']).toBe('Bash(git:*) Read')
      }
    })

    it('handles Windows line endings (CRLF)', () => {
      const input = '---\r\nname: win-skill\r\ndescription: Windows line endings.\r\n---\r\n\r\nBody.\r\n'
      const result = parseSkillMd(input)

      expect(result.success).toBe(true)
    })

    it('preserves markdown formatting in body', () => {
      const input = `---
name: md-skill
description: Test markdown preservation.
---

# Heading 1

## Heading 2

- List item 1
- List item 2

\`\`\`python
print("code block")
\`\`\`
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.skill.body).toContain('# Heading 1')
        expect(result.skill.body).toContain('```python')
      }
    })

    it('handles empty body', () => {
      const input = `---
name: empty-body
description: Skill with empty body.
---

`
      const result = parseSkillMd(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.skill.body).toBe('')
      }
    })
  })

  describe('invalid inputs', () => {
    it('rejects content without frontmatter', () => {
      const input = `# No Frontmatter

Just body content.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('frontmatter')
      }
    })

    it('rejects malformed YAML', () => {
      const input = `---
name: bad-yaml
description: [invalid: yaml: here
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('YAML')
      }
    })

    it('rejects missing name', () => {
      const input = `---
description: No name field.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects missing description', () => {
      const input = `---
name: no-desc
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects invalid name format (uppercase)', () => {
      const input = `---
name: Invalid-Name
description: Has uppercase.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects name starting with hyphen', () => {
      const input = `---
name: -starts-hyphen
description: Invalid name.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects name ending with hyphen', () => {
      const input = `---
name: ends-hyphen-
description: Invalid name.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects consecutive hyphens in name', () => {
      const input = `---
name: double--hyphen
description: Invalid name.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects reserved name "anthropic"', () => {
      const input = `---
name: anthropic
description: Reserved name.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects reserved name "claude"', () => {
      const input = `---
name: claude
description: Reserved name.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects name over 64 characters', () => {
      const longName = 'a'.repeat(65)
      const input = `---
name: ${longName}
description: Name too long.
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })

    it('rejects description over 1024 characters', () => {
      const longDesc = 'a'.repeat(1025)
      const input = `---
name: long-desc
description: ${longDesc}
---

Body.
`
      const result = parseSkillMd(input)

      expect(result.success).toBe(false)
    })
  })
})

describe('serializeSkillMd', () => {
  it('serializes skill back to SKILL.md format', () => {
    const skill = {
      metadata: {
        name: 'test-skill',
        description: 'A test skill.',
      },
      body: '# Test\n\nBody content.',
    }

    const result = serializeSkillMd(skill)

    expect(result).toContain('---')
    expect(result).toContain('name: test-skill')
    expect(result).toContain('description: A test skill.')
    expect(result).toContain('# Test')
  })

  it('round-trips parse -> serialize -> parse', () => {
    const original = `---
name: roundtrip
description: Test round trip.
---

# Original Body

Content here.
`
    const parsed = parseSkillMd(original)
    expect(parsed.success).toBe(true)

    if (parsed.success) {
      const serialized = serializeSkillMd(parsed.skill)
      const reparsed = parseSkillMd(serialized)

      expect(reparsed.success).toBe(true)
      if (reparsed.success) {
        expect(reparsed.skill.metadata.name).toBe(parsed.skill.metadata.name)
        expect(reparsed.skill.metadata.description).toBe(parsed.skill.metadata.description)
      }
    }
  })
})
