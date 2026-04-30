import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SkillActivatedItem, SkillCreatedItem } from 'backend/agent'
import { SkillActivatedEvent, SkillCreatedEvent } from '@/components/skills'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createSkillActivatedItem(overrides: Partial<SkillActivatedItem> = {}): SkillActivatedItem {
  return {
    id: 'skill-activated-1',
    type: 'skill_activated',
    skillName: 'research-brief',
    skillDescription: 'Research the workspace and prepare a concise brief.',
    args: 'focus=timeline',
    timestamp: Date.now(),
    ...overrides,
  }
}

function createSkillCreatedItem(overrides: Partial<SkillCreatedItem> = {}): SkillCreatedItem {
  return {
    id: 'skill-created-1',
    type: 'skill_created',
    skillName: 'weekly-summary',
    skillDescription: 'Summarize weekly progress and open questions.',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('skill timeline events', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders skill activation as a compact two-line timeline pill', async () => {
    await act(async () => {
      root.render(<SkillActivatedEvent item={createSkillActivatedItem()} />)
    })

    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).toContain('Used skill')
    expect(container.textContent).toContain('/research-brief')
    expect(container.textContent).toContain('Research the workspace and prepare a concise brief.')
    expect(container.textContent).not.toContain('focus=timeline')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
    expect(container.querySelector('.border-chat-pill-border.bg-chat-background\\/70')).toBeNull()
  })

  it('renders skill creation as a compact two-line timeline pill', async () => {
    await act(async () => {
      root.render(<SkillCreatedEvent item={createSkillCreatedItem()} />)
    })

    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).toContain('Created skill')
    expect(container.textContent).toContain('/weekly-summary')
    expect(container.textContent).toContain('Summarize weekly progress and open questions.')
    expect(container.textContent).not.toContain('Invoke with')
    expect(container.textContent).toContain('/weekly-summary')
    expect(container.querySelector('.bg-chat-pill')).not.toBeNull()
  })
})
