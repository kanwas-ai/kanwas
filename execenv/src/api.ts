/**
 * Simple fetch-based API client for execenv.
 * Uses native Node.js fetch, FormData, and Blob (Node 18+).
 */

import type { Logger } from 'pino'
import type { SignedUrlResponse, FileUploadResponse, WorkspaceMemberResponse, AuthMeResponse } from './api-types.js'

let apiConfig: { backendUrl: string; authToken: string; logger?: Logger } | null = null

export interface ApiClientOptions {
  backendUrl: string
  authToken: string
  logger?: Logger
}

export function initializeApiClient(options: ApiClientOptions): void {
  apiConfig = options
}

function getConfig() {
  if (!apiConfig) {
    throw new Error('API client not initialized. Call initializeApiClient first.')
  }
  return apiConfig
}

/**
 * Fetch a file binary from storage using signed URL.
 * Works for images, PDFs, and any other binary file type.
 */
export async function fetchFileBinary(storagePath: string): Promise<Buffer> {
  const { backendUrl, authToken, logger } = getConfig()
  const log = logger?.child({ component: 'ApiClient' })
  const startTime = Date.now()

  log?.debug({ storagePath }, 'Fetching file binary')

  const response = await fetch(`${backendUrl}/files/signed-url?path=${encodeURIComponent(storagePath)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (!response.ok) {
    log?.error({ storagePath, status: response.status }, 'Failed to get signed URL')
    throw new Error(`Failed to get signed URL: ${response.statusText}`)
  }

  const data = (await response.json()) as SignedUrlResponse
  const fileResponse = await fetch(data.url)

  if (!fileResponse.ok) {
    log?.error({ storagePath, status: fileResponse.status }, 'Failed to fetch file')
    throw new Error(`Failed to fetch file: ${fileResponse.statusText}`)
  }

  const buffer = Buffer.from(await fileResponse.arrayBuffer())
  const durationMs = Date.now() - startTime
  log?.debug({ storagePath, size: buffer.length, durationMs }, 'File binary fetched')

  return buffer
}

/**
 * Upload a file to storage using native fetch + FormData.
 * Works for images, PDFs, and any other binary file type.
 */
export async function uploadFile(
  workspaceId: string,
  fileBuffer: Buffer,
  canvasId: string,
  filename: string,
  mimeType: string
): Promise<FileUploadResponse> {
  const { backendUrl, authToken, logger } = getConfig()
  const log = logger?.child({ component: 'ApiClient' })
  const startTime = Date.now()

  log?.debug({ workspaceId, canvasId, filename, mimeType, size: fileBuffer.length }, 'Uploading file')

  // Native FormData + Blob (Node.js 18+)
  const formData = new FormData()
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename)
  formData.append('canvas_id', canvasId)
  formData.append('filename', filename)

  const response = await fetch(`${backendUrl}/workspaces/${workspaceId}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      // DO NOT set Content-Type - FormData sets it with boundary automatically
    },
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    log?.error({ workspaceId, canvasId, filename, status: response.status, error: errorData }, 'Failed to upload file')
    throw new Error(`Failed to upload file: ${response.status} - ${JSON.stringify(errorData)}`)
  }

  const result = (await response.json()) as FileUploadResponse
  const durationMs = Date.now() - startTime
  log?.info({ workspaceId, canvasId, filename, storagePath: result.storagePath, durationMs }, 'File uploaded')

  return result
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberResponse[]> {
  const { backendUrl, authToken, logger } = getConfig()
  const log = logger?.child({ component: 'ApiClient' })
  const startTime = Date.now()

  log?.debug({ workspaceId }, 'Fetching workspace members')

  const response = await fetch(`${backendUrl}/workspaces/${workspaceId}/members`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log?.error({ workspaceId, status: response.status, body }, 'Failed to fetch workspace members')
    throw new Error(`Failed to fetch workspace members: ${response.status}`)
  }

  const members = (await response.json()) as WorkspaceMemberResponse[]
  const durationMs = Date.now() - startTime
  log?.debug({ workspaceId, count: members.length, durationMs }, 'Workspace members fetched')
  return members
}

export interface YjsSocketTokenResponse {
  token: string
  expiresAt: string
}

export async function fetchYjsSocketToken(workspaceId: string): Promise<YjsSocketTokenResponse> {
  const { backendUrl, authToken, logger } = getConfig()
  const log = logger?.child({ component: 'ApiClient' })

  const response = await fetch(`${backendUrl}/workspaces/${workspaceId}/yjs-socket-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log?.error({ workspaceId, status: response.status, body }, 'Failed to mint Yjs socket token')
    throw new Error(`Failed to mint Yjs socket token: ${response.status}`)
  }

  const result = (await response.json()) as YjsSocketTokenResponse
  if (!result.token) {
    throw new Error('Yjs socket token response missing "token" field')
  }
  return result
}

export async function fetchCurrentUser(): Promise<AuthMeResponse> {
  const { backendUrl, authToken, logger } = getConfig()
  const log = logger?.child({ component: 'ApiClient' })
  const startTime = Date.now()

  log?.debug('Fetching current user profile')

  const response = await fetch(`${backendUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log?.error({ status: response.status, body }, 'Failed to fetch current user profile')
    throw new Error(`Failed to fetch current user profile: ${response.status}`)
  }

  const user = (await response.json()) as AuthMeResponse
  const durationMs = Date.now() - startTime
  log?.debug({ userId: user.id, durationMs }, 'Fetched current user profile')
  return user
}

export type { SignedUrlResponse, FileUploadResponse, WorkspaceMemberResponse, AuthMeResponse }
