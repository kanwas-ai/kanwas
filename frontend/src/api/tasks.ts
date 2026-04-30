import type { SerializedState } from 'backend/agent'
import { getOrCreateCorrelationId } from '@/lib/correlation-id'
import { TOKEN_KEY } from '@/providers/auth/tokenKey'
import { baseURL, tuyau } from './client'

export type TaskStatus = 'initiated' | 'processing' | 'waiting' | 'complete' | 'error'

export interface TaskListItem {
  taskId: string
  rootInvocationId: string
  latestInvocationId: string
  status: TaskStatus
  title: string
  description: string
  modifiedFolders: string[]
  createdAt: string
  updatedAt: string
}

export interface TaskListResponse {
  tasks: TaskListItem[]
  nextCursor: string | null
}

export interface ListTasksOptions {
  limit?: number
  status?: TaskStatus
  cursor?: string
}

type AgentStateSnapshot = {
  state?: SerializedState
}

export interface InvocationStateResponse {
  invocationId: string
  state: AgentStateSnapshot | null
}

export interface AnswerQuestionPayload {
  answers: Record<string, string[]>
  canvas_id?: string | null
  mode?: string
  yolo_mode?: boolean
  workspace_tree?: string
  canvas_path?: string | null
  active_canvas_context?: string | null
  selected_node_paths?: string[]
  mentioned_node_paths?: string[]
}

export interface AnswerQuestionResponse {
  invocationId: string
  taskId: string
  state: AgentStateSnapshot | null
}

export interface ArchiveTaskResponse {
  taskId: string
  archivedAt: string
}

export interface UpsertTaskListResult {
  next: TaskListResponse
  changed: boolean
  inserted: boolean
}

export interface ApplyRealtimeTaskUpsertResult {
  next: TaskListResponse | undefined
  changed: boolean
  inserted: boolean
  ignored: boolean
}

export interface TaskUpsertPayload {
  taskId: string
  rootInvocationId: string
  latestInvocationId: string
  status: TaskStatus
  modifiedFolders: string[]
  updatedAt: string
}

const DEFAULT_TASK_LIMIT = 50

export const taskListQueryKey = (workspaceId: string) => ['tasks', workspaceId] as const

export const taskArchiveGuardQueryKey = (workspaceId: string) => ['tasks', workspaceId, 'archive-guard'] as const

export const invocationStateQueryKey = (invocationId: string) => ['invocation', invocationId] as const

function toMillis(isoTimestamp: string): number {
  const parsed = Date.parse(isoTimestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

export function compareTaskOrder(
  a: Pick<TaskListItem, 'updatedAt' | 'taskId'>,
  b: Pick<TaskListItem, 'updatedAt' | 'taskId'>
) {
  const updatedAtDifference = toMillis(b.updatedAt) - toMillis(a.updatedAt)
  if (updatedAtDifference !== 0) {
    return updatedAtDifference
  }

  return b.taskId.localeCompare(a.taskId)
}

export function shouldApplyTaskUpsert(
  current: Pick<TaskListItem, 'updatedAt' | 'taskId'>,
  incoming: Pick<TaskListItem, 'updatedAt' | 'taskId'>
): boolean {
  const incomingTime = toMillis(incoming.updatedAt)
  const currentTime = toMillis(current.updatedAt)

  if (incomingTime > currentTime) {
    return true
  }

  if (incomingTime < currentTime) {
    return false
  }

  return incoming.taskId.localeCompare(current.taskId) >= 0
}

export function upsertTaskListResponse(args: {
  current: TaskListResponse | undefined
  taskId: string
  createTask: () => TaskListItem
  updateTask: (existing: TaskListItem) => TaskListItem
  shouldUpdate?: (existing: TaskListItem) => boolean
}): UpsertTaskListResult {
  const { current, taskId, createTask, updateTask, shouldUpdate = () => true } = args

  if (!current) {
    return {
      next: {
        tasks: [createTask()],
        nextCursor: null,
      },
      changed: true,
      inserted: true,
    }
  }

  const taskIndex = current.tasks.findIndex((task) => task.taskId === taskId)
  if (taskIndex === -1) {
    const nextTasks = [createTask(), ...current.tasks]
    nextTasks.sort(compareTaskOrder)

    return {
      next: {
        ...current,
        tasks: nextTasks,
      },
      changed: true,
      inserted: true,
    }
  }

  const existingTask = current.tasks[taskIndex]
  if (!shouldUpdate(existingTask)) {
    return {
      next: current,
      changed: false,
      inserted: false,
    }
  }

  const nextTasks = [...current.tasks]
  nextTasks[taskIndex] = updateTask(existingTask)
  nextTasks.sort(compareTaskOrder)

  return {
    next: {
      ...current,
      tasks: nextTasks,
    },
    changed: true,
    inserted: false,
  }
}

export function getInvocationTimeline(response: InvocationStateResponse | null): SerializedState['timeline'] | null {
  const timeline = response?.state?.state?.timeline
  return Array.isArray(timeline) ? timeline : null
}

export function createTaskPlaceholderFromUpsert(payload: TaskUpsertPayload): TaskListItem {
  return {
    taskId: payload.taskId,
    rootInvocationId: payload.rootInvocationId,
    latestInvocationId: payload.latestInvocationId,
    status: payload.status,
    title: 'New task',
    description: '',
    modifiedFolders: payload.modifiedFolders,
    createdAt: payload.updatedAt,
    updatedAt: payload.updatedAt,
  }
}

export function applyRealtimeTaskUpsert(args: {
  current: TaskListResponse | undefined
  payload: TaskUpsertPayload
  guardedTaskIds?: readonly string[]
}): ApplyRealtimeTaskUpsertResult {
  const { current, payload, guardedTaskIds = [] } = args

  if (guardedTaskIds.includes(payload.taskId)) {
    return {
      next: current,
      changed: false,
      inserted: false,
      ignored: true,
    }
  }

  const result = upsertTaskListResponse({
    current,
    taskId: payload.taskId,
    createTask: () => createTaskPlaceholderFromUpsert(payload),
    shouldUpdate: (existingTask) => shouldApplyTaskUpsert(existingTask, payload),
    updateTask: (existingTask) => ({
      ...existingTask,
      rootInvocationId: payload.rootInvocationId,
      latestInvocationId: payload.latestInvocationId,
      status: payload.status,
      modifiedFolders: payload.modifiedFolders,
      updatedAt: payload.updatedAt,
    }),
  })

  return {
    ...result,
    ignored: false,
  }
}

export async function listTasks(workspaceId: string, options: ListTasksOptions = {}): Promise<TaskListResponse> {
  const response = await tuyau.workspaces({ id: workspaceId }).tasks.$get({
    query: {
      limit: String(options.limit ?? DEFAULT_TASK_LIMIT),
      ...(options.status ? { status: options.status } : {}),
      ...(options.cursor ? { cursor: options.cursor } : {}),
    },
  })

  if (response.error) {
    throw response.error
  }

  return (response.data as TaskListResponse) ?? { tasks: [], nextCursor: null }
}

export async function getInvocationState(invocationId: string): Promise<InvocationStateResponse | null> {
  try {
    const authToken = localStorage.getItem(TOKEN_KEY)
    if (!authToken) {
      return null
    }

    const normalizedBaseUrl = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL

    const response = await fetch(`${normalizedBaseUrl}/agent/invocations/${invocationId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'x-correlation-id': getOrCreateCorrelationId(),
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as InvocationStateResponse
  } catch {
    return null
  }
}

export async function answerInvocationQuestion(
  invocationId: string,
  itemId: string,
  payload: AnswerQuestionPayload
): Promise<AnswerQuestionResponse> {
  const authToken = localStorage.getItem(TOKEN_KEY)
  if (!authToken) {
    throw new Error('Missing auth token')
  }

  const normalizedBaseUrl = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
  const response = await fetch(`${normalizedBaseUrl}/agent/invocations/${invocationId}/questions/${itemId}/answer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      'x-correlation-id': getOrCreateCorrelationId(),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw errorBody ?? new Error('Failed to answer question')
  }

  return (await response.json()) as AnswerQuestionResponse
}

export async function archiveTask(workspaceId: string, taskId: string): Promise<ArchiveTaskResponse> {
  const response = await tuyau.workspaces({ id: workspaceId }).tasks({ taskId }).archive.$post()

  if (response.error) {
    throw response.error
  }

  return response.data as ArchiveTaskResponse
}
