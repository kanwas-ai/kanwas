import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuggestedTasksItem } from 'backend/agent'
import type { WorkspaceSuggestedTask } from '@/api/suggestedTasks'
import { SuggestedTasksTimelineItem } from '@/components/chat/SuggestedTasksTimelineItem'
import {
  createInlineSuggestedTaskStartRequest,
  createPersistedSuggestedTaskStartRequest,
  shouldRefreshWorkspaceSuggestedTasks,
} from '@/components/chat/suggestedTasks'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createTask(overrides: Partial<WorkspaceSuggestedTask> = {}): WorkspaceSuggestedTask {
  return {
    id: 'suggested-task-1',
    emoji: '🧭',
    headline: 'Map the onboarding flow',
    description: 'Trace the current onboarding steps and capture the first friction points.',
    prompt: 'Map the onboarding flow and note the first friction points.',
    ...overrides,
  }
}

function createSuggestedTasksItem(overrides: Partial<SuggestedTasksItem> = {}): SuggestedTasksItem {
  return {
    id: 'suggested-tasks-1',
    type: 'suggested_tasks',
    timestamp: Date.now(),
    scope: 'global',
    status: 'completed',
    hasPersistedCopy: true,
    tasks: [createTask()],
    ...overrides,
  }
}

describe('suggested task helpers', () => {
  it('keeps local inline suggestions timeline-only', () => {
    const task = createTask()
    const request = createInlineSuggestedTaskStartRequest(
      createSuggestedTasksItem({ scope: 'local', hasPersistedCopy: false }),
      task
    )

    expect(request.task).toEqual(task)
    expect(request.deleteSuggestionId).toBeUndefined()
  })

  it('deletes persisted copies for global suggestions and refreshes only persisted completions', () => {
    const task = createTask({ id: 'suggested-task-global' })
    const globalItem = createSuggestedTasksItem({ tasks: [task] })
    const persistedRequest = createPersistedSuggestedTaskStartRequest(task)
    const inlineRequest = createInlineSuggestedTaskStartRequest(globalItem, task)

    expect(persistedRequest.deleteSuggestionId).toBe('suggested-task-global')
    expect(inlineRequest.deleteSuggestionId).toBe('suggested-task-global')
    expect(shouldRefreshWorkspaceSuggestedTasks(globalItem)).toBe(true)
    expect(
      shouldRefreshWorkspaceSuggestedTasks(createSuggestedTasksItem({ scope: 'local', hasPersistedCopy: false }))
    ).toBe(false)
    expect(
      shouldRefreshWorkspaceSuggestedTasks(
        createSuggestedTasksItem({ status: 'loading', tasks: [], hasPersistedCopy: false })
      )
    ).toBe(false)
  })
})

describe('SuggestedTasksTimelineItem', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await act(async () => {
      root.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders completed inline suggestions and starts tasks without inline delete controls', async () => {
    const onSuggestedTaskStart = vi.fn()
    const item = createSuggestedTasksItem({
      tasks: [
        createTask({
          id: 'suggested-task-ship',
          headline: 'Ship the first activation checklist',
          description: 'Turn the onboarding steps into a lightweight activation checklist.',
        }),
      ],
    })

    await act(async () => {
      root.render(<SuggestedTasksTimelineItem item={item} onSuggestedTaskStart={onSuggestedTaskStart} />)
    })

    expect(container.textContent).toContain('Great - want to keep going?')
    expect(container.textContent).toContain('I turned this into a few strong next steps. Pick one to start.')
    expect(container.textContent).not.toContain('Saved to Tasks')
    expect(container.textContent).toContain('Ship the first activation checklist')
    expect(container.querySelector('[aria-label^="Delete suggestion"]')).toBeNull()

    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Ship the first activation checklist')
    )

    expect(startButton).toBeTruthy()

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSuggestedTaskStart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'suggested-task-ship',
        headline: 'Ship the first activation checklist',
      })
    )
  })

  it('renders loading and failed states with scope-aware copy', async () => {
    await act(async () => {
      root.render(<SuggestedTasksTimelineItem item={createSuggestedTasksItem({ status: 'loading', tasks: [] })} />)
    })

    expect(container.textContent).toContain('Thinking through your next steps...')
    expect(container.textContent).toContain("I'm turning what we've covered into a few concrete next tasks.")

    await act(async () => {
      root.render(
        <SuggestedTasksTimelineItem
          item={createSuggestedTasksItem({
            status: 'failed',
            error: 'Suggestions were already generated for this workspace.',
            tasks: [],
          })}
        />
      )
    })

    expect(container.textContent).toContain('Could not save suggested tasks')
    expect(container.textContent).toContain('Suggestions were already generated for this workspace.')
  })
})
