import { describe, expect, it } from 'vitest'
import { getCanvasIconClassName } from '@/components/sidebar/explorer/sidebar-icons'

describe('sidebar canvas icons', () => {
  it('uses the brain icon for top-level brain and memory folders', () => {
    expect(getCanvasIconClassName('brain', true)).toBe('fa-solid fa-brain')
    expect(getCanvasIconClassName('Memory', true)).toBe('fa-solid fa-brain')
  })

  it('uses a project icon for the top-level projects folder', () => {
    expect(getCanvasIconClassName('projects', true)).toBe('fa-solid fa-diagram-project')
  })

  it('keeps regular folder icons for nested or unknown folders', () => {
    expect(getCanvasIconClassName('projects', false)).toBe('fa-solid fa-folder')
    expect(getCanvasIconClassName('notes', true)).toBe('fa-solid fa-folder')
  })
})
