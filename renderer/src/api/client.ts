import type {
  FlushResponse,
  LinkMetadataRequest,
  LinkMetadataResponse,
  NoteBaselineResponse,
  NoteSaveConflict,
  NoteSaveRequest,
  NoteSaveResponse,
  UploadResponse,
  WorkspaceSummary,
  YjsTokenResponse,
} from 'shared/local-api'

/** The renderer and embedded local runtime always share one loopback origin. */
export const baseURL = window.location.origin

export class LocalApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'LocalApiError'
    this.status = status
    this.body = body
  }
}

function apiPath(path: string): string {
  return path.startsWith('/api/') || path === '/api' ? path : `/api${path.startsWith('/') ? path : `/${path}`}`
}

export function localApiUrl(path: string): URL {
  return new URL(apiPath(path), `${baseURL}/`)
}

async function responseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => '')
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const value = body as { error?: unknown; message?: unknown }
    if (typeof value.error === 'string') return value.error
    if (typeof value.message === 'string') return value.message
  }
  if (typeof body === 'string' && body.trim()) return body
  return `Local API request failed (${status})`
}

export async function localFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(localApiUrl(path), { ...init, headers })
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await localFetch(path, init)
  const body = await responseBody(response)
  if (!response.ok) {
    throw new LocalApiError(response.status, errorMessage(response.status, body), body)
  }
  return body as T
}

export const localApi = {
  listWorkspaces: () => requestJson<WorkspaceSummary[]>('/workspaces'),

  getWorkspace: (workspaceId: string) =>
    requestJson<WorkspaceSummary>(`/workspaces/${encodeURIComponent(workspaceId)}`),

  mintYjsToken: (workspaceId: string) =>
    requestJson<YjsTokenResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/yjs-token`, { method: 'POST' }),

  uploadFile: async (workspaceId: string, file: File, canvasId: string, filename: string) => {
    const body = new FormData()
    body.set('file', file)
    body.set('canvas_id', canvasId)
    body.set('filename', filename)
    return requestJson<UploadResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/files`, {
      method: 'POST',
      body,
    })
  },

  saveNote: (workspaceId: string, nodeId: string, input: NoteSaveRequest) =>
    requestJson<NoteSaveResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(nodeId)}/content`,
      { method: 'PUT', body: JSON.stringify(input) }
    ),

  getNoteBaseline: (workspaceId: string, nodeId: string) =>
    requestJson<NoteBaselineResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(nodeId)}/content`
    ),

  flushWorkspace: (workspaceId: string) =>
    requestJson<FlushResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/flush`, { method: 'POST' }),

  linkMetadata: (workspaceId: string, input: LinkMetadataRequest) =>
    requestJson<LinkMetadataResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/link-metadata`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}

export function isNoteSaveConflict(error: unknown): error is LocalApiError & { body: NoteSaveConflict } {
  return error instanceof LocalApiError && error.status === 409
}

export function rawFileUrl(
  workspaceId: string,
  storagePath: string,
  options: { download?: boolean; filename?: string; contentHash?: string } = {}
): string {
  const url = localApiUrl('/files/raw')
  url.searchParams.set('workspaceId', workspaceId)
  url.searchParams.set('path', storagePath)
  if (options.download) url.searchParams.set('download', '1')
  if (options.filename) url.searchParams.set('filename', options.filename)
  if (options.contentHash) url.searchParams.set('v', options.contentHash)
  return url.toString()
}
