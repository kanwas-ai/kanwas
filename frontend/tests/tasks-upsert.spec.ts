import { describe, expect, it } from 'vitest'
import { applyRealtimeTaskUpsert, type TaskListItem, type TaskListResponse } from '@/api/tasks'

function createTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    taskId: 'task-1',
    rootInvocationId: 'root-1',
    latestInvocationId: 'invocation-1',
    status: 'processing',
    title: 'Existing task',
    description: 'Existing description',
    modifiedFolders: [],
    createdAt: '2026-03-04T12:00:00.000Z',
    updatedAt: '2026-03-04T12:00:00.000Z',
    ...overrides,
  }
}

function createTaskList(tasks: TaskListItem[]): TaskListResponse {
  return {
    tasks,
    nextCursor: null,
  }
}

describe('applyRealtimeTaskUpsert', () => {
  it('ignores upserts for guarded task ids', () => {
    const current = createTaskList([createTask({ taskId: 'task-archive', modifiedFolders: ['plans/current'] })])

    const result = applyRealtimeTaskUpsert({
      current,
      payload: {
        taskId: 'task-archive',
        rootInvocationId: 'root-archive',
        latestInvocationId: 'inv-archive',
        status: 'processing',
        modifiedFolders: ['docs/new'],
        updatedAt: '2026-03-04T12:10:00.000Z',
      },
      guardedTaskIds: ['task-archive'],
    })

    expect(result.ignored).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.inserted).toBe(false)
    expect(result.next).toBe(current)
    expect(result.next?.tasks[0].modifiedFolders).toEqual(['plans/current'])
  })

  it('inserts placeholder task when unguarded upsert arrives for missing task', () => {
    const current = createTaskList([createTask({ taskId: 'task-1', updatedAt: '2026-03-04T12:00:00.000Z' })])

    const result = applyRealtimeTaskUpsert({
      current,
      payload: {
        taskId: 'task-2',
        rootInvocationId: 'root-2',
        latestInvocationId: 'inv-2',
        status: 'initiated',
        modifiedFolders: ['docs', 'specs'],
        updatedAt: '2026-03-04T12:20:00.000Z',
      },
    })

    expect(result.ignored).toBe(false)
    expect(result.changed).toBe(true)
    expect(result.inserted).toBe(true)
    expect(result.next?.tasks.map((task) => task.taskId)).toEqual(['task-2', 'task-1'])
    expect(result.next?.tasks[0]).toMatchObject({
      taskId: 'task-2',
      rootInvocationId: 'root-2',
      latestInvocationId: 'inv-2',
      status: 'initiated',
      title: 'New task',
      description: '',
      modifiedFolders: ['docs', 'specs'],
      createdAt: '2026-03-04T12:20:00.000Z',
      updatedAt: '2026-03-04T12:20:00.000Z',
    })
  })

  it('updates existing task when incoming upsert is newer', () => {
    const current = createTaskList([
      createTask({
        taskId: 'task-2',
        rootInvocationId: 'root-old',
        latestInvocationId: 'inv-old',
        status: 'processing',
        title: 'Keep title',
        description: 'Keep description',
        modifiedFolders: ['notes/old'],
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-04T12:00:00.000Z',
      }),
    ])

    const result = applyRealtimeTaskUpsert({
      current,
      payload: {
        taskId: 'task-2',
        rootInvocationId: 'root-new',
        latestInvocationId: 'inv-new',
        status: 'complete',
        modifiedFolders: ['docs/new'],
        updatedAt: '2026-03-04T12:30:00.000Z',
      },
    })

    expect(result.ignored).toBe(false)
    expect(result.changed).toBe(true)
    expect(result.inserted).toBe(false)
    expect(result.next?.tasks[0]).toMatchObject({
      taskId: 'task-2',
      rootInvocationId: 'root-new',
      latestInvocationId: 'inv-new',
      status: 'complete',
      title: 'Keep title',
      description: 'Keep description',
      modifiedFolders: ['docs/new'],
      createdAt: '2026-03-04T10:00:00.000Z',
      updatedAt: '2026-03-04T12:30:00.000Z',
    })
  })

  it('keeps current cache when incoming upsert is stale', () => {
    const current = createTaskList([
      createTask({
        taskId: 'task-2',
        latestInvocationId: 'inv-current',
        status: 'processing',
        modifiedFolders: ['plans/current'],
        updatedAt: '2026-03-04T12:40:00.000Z',
      }),
    ])

    const result = applyRealtimeTaskUpsert({
      current,
      payload: {
        taskId: 'task-2',
        rootInvocationId: 'root-current',
        latestInvocationId: 'inv-stale',
        status: 'error',
        modifiedFolders: ['docs/stale'],
        updatedAt: '2026-03-04T12:35:00.000Z',
      },
    })

    expect(result.ignored).toBe(false)
    expect(result.changed).toBe(false)
    expect(result.inserted).toBe(false)
    expect(result.next).toBe(current)
    expect(result.next?.tasks[0].modifiedFolders).toEqual(['plans/current'])
  })
})
