import { describe, it, expect } from 'vitest'
import {
  validateSkillName,
  validateSkillDescription,
  validateSkillMetadata,
  isReservedName,
} from '../../../src/skills/validator.js'

describe('validateSkillName', () => {
  describe('valid names', () => {
    const validNames = ['skill', 'my-skill', 'skill-v2', 'a', 'skill123', '123skill', 'a-b-c-d']

    it.each(validNames)('accepts "%s"', (name) => {
      const result = validateSkillName(name)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('invalid names', () => {
    const invalidNames = [
      { name: '', reason: 'empty' },
      { name: 'UPPERCASE', reason: 'has uppercase' },
      { name: 'Mixed-Case', reason: 'has mixed case' },
      { name: '-leading', reason: 'starts with hyphen' },
      { name: 'trailing-', reason: 'ends with hyphen' },
      { name: 'double--hyphen', reason: 'consecutive hyphens' },
      { name: 'has space', reason: 'has space' },
      { name: 'has_underscore', reason: 'has underscore' },
      { name: 'has.dot', reason: 'has dot' },
      { name: 'a'.repeat(65), reason: 'too long' },
    ]

    it.each(invalidNames)('rejects "$name" ($reason)', ({ name }) => {
      const result = validateSkillName(name)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})

describe('validateSkillDescription', () => {
  it('accepts valid description', () => {
    const result = validateSkillDescription('A valid description.')
    expect(result.valid).toBe(true)
  })

  it('rejects empty description', () => {
    const result = validateSkillDescription('')
    expect(result.valid).toBe(false)
  })

  it('rejects description over 1024 chars', () => {
    const result = validateSkillDescription('a'.repeat(1025))
    expect(result.valid).toBe(false)
  })

  it('accepts description at exactly 1024 chars', () => {
    const result = validateSkillDescription('a'.repeat(1024))
    expect(result.valid).toBe(true)
  })
})

describe('validateSkillMetadata', () => {
  it('validates complete metadata object', () => {
    const metadata = {
      name: 'test-skill',
      description: 'A test skill.',
      license: 'MIT',
    }
    const result = validateSkillMetadata(metadata)
    expect(result.valid).toBe(true)
  })

  it('returns specific field errors', () => {
    const metadata = {
      name: 'INVALID',
      description: '',
    }
    const result = validateSkillMetadata(metadata)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('name'))).toBe(true)
    expect(result.errors.some((e) => e.includes('description'))).toBe(true)
  })
})

describe('isReservedName', () => {
  it('returns true for "anthropic"', () => {
    expect(isReservedName('anthropic')).toBe(true)
  })

  it('returns true for "claude"', () => {
    expect(isReservedName('claude')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isReservedName('ANTHROPIC')).toBe(true)
    expect(isReservedName('Claude')).toBe(true)
  })

  it('returns false for non-reserved names', () => {
    expect(isReservedName('my-skill')).toBe(false)
    expect(isReservedName('claude-helper')).toBe(false) // Contains but not exact
  })
})
