import { tuyau } from '@/api/client'
import type { InvocationStateResponse } from '@/api/tasks'

type ApiError = { error?: string; message?: string }

export type WorkspaceOnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'

export interface WorkspaceOnboardingStartResponse {
  invocationId: string
  taskId: string
  onboardingStatus: WorkspaceOnboardingStatus
  state?: InvocationStateResponse['state']
  blocked?: {
    reason?: string | null
    resetAtUtc?: string | null
    blockedPeriodTypes?: string[]
  }
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.error) return new Error(apiError.error)
    if (apiError.message) return new Error(apiError.message)
  }

  return new Error(fallbackMessage)
}

export const listWorkspaces = async () => {
  const response = await tuyau.workspaces.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load workspaces')
  }

  return response.data ?? []
}

export const getWorkspace = async (id: string) => {
  const response = await tuyau.workspaces({ id }).$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load workspace')
  }

  return response.data!
}

export const createWorkspace = async (body: { name: string; workspaceId?: string }) => {
  const response = await tuyau.workspaces.$post(body)
  if (response.error) {
    throw toError(response.error, 'Failed to create workspace')
  }

  return response.data!
}

export const updateWorkspace = async (id: string, body: { name: string }) => {
  const response = await tuyau.workspaces({ id }).$patch(body)
  if (response.error) {
    throw toError(response.error, 'Failed to update workspace')
  }

  return response.data!
}

export const deleteWorkspace = async (id: string) => {
  const response = await tuyau.workspaces({ id }).$delete()
  if (response.error) {
    throw toError(response.error, 'Failed to delete workspace')
  }
}

export const duplicateWorkspace = async (id: string) => {
  const response = await tuyau.workspaces({ id }).duplicate.$post()
  if (response.error) {
    throw toError(response.error, 'Failed to duplicate workspace')
  }

  return response.data!
}

export const startWorkspaceOnboarding = async (id: string): Promise<WorkspaceOnboardingStartResponse> => {
  const response = await tuyau.workspaces({ id }).onboarding.start.$post()
  if (response.error) {
    throw toError(response.error, 'Failed to start onboarding')
  }

  return response.data!
}
