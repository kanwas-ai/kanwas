import { describe, expect, it } from 'vitest'
import { detectAgents, isAgentId } from '../src/terminal/agents.js'

describe('terminal agents', () => {
  it('shell is always reported available (no external dependency)', async () => {
    const agents = await detectAgents()
    expect(agents.map((a) => a.id).sort()).toEqual(['claude', 'codex', 'shell'])
    const shell = agents.find((a) => a.id === 'shell')
    expect(shell?.available).toBe(true)
    expect(shell?.command.length).toBeGreaterThan(0)
  })

  it('isAgentId narrows only the known ids', () => {
    expect(isAgentId('claude')).toBe(true)
    expect(isAgentId('codex')).toBe(true)
    expect(isAgentId('shell')).toBe(true)
    expect(isAgentId('nope')).toBe(false)
    expect(isAgentId('')).toBe(false)
  })
})
