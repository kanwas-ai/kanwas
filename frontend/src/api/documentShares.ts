import { tuyau } from '@/api/client'
import type {
  DocumentShareAccessMode,
  DocumentShareOwnerState,
  WorkspaceDocumentSharesState,
} from 'shared/document-share'

type ApiError = { error?: string; message?: string }

function toError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.error) return new Error(apiError.error)
    if (apiError.message) return new Error(apiError.message)
  }

  return new Error(fallbackMessage)
}

export interface SaveDocumentShareInput {
  name: string
  accessMode: DocumentShareAccessMode
}

export const listWorkspaceDocumentShares = async (workspaceId: string): Promise<WorkspaceDocumentSharesState> => {
  const response = await tuyau.workspaces({ id: workspaceId })['document-shares'].$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load workspace shares')
  }

  return response.data as WorkspaceDocumentSharesState
}

export const getDocumentShare = async (workspaceId: string, noteId: string): Promise<DocumentShareOwnerState> => {
  const response = await tuyau.workspaces({ id: workspaceId }).notes({ noteId }).share.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load share settings')
  }

  return response.data as DocumentShareOwnerState
}

export const createDocumentShare = async (
  workspaceId: string,
  noteId: string,
  body: SaveDocumentShareInput
): Promise<DocumentShareOwnerState> => {
  const response = await tuyau.workspaces({ id: workspaceId }).notes({ noteId }).share.$post(body)
  if (response.error) {
    throw toError(response.error, 'Failed to create share link')
  }

  return response.data as DocumentShareOwnerState
}

export const updateDocumentShare = async (
  workspaceId: string,
  noteId: string,
  body: SaveDocumentShareInput
): Promise<DocumentShareOwnerState> => {
  const response = await tuyau.workspaces({ id: workspaceId }).notes({ noteId }).share.$patch(body)
  if (response.error) {
    throw toError(response.error, 'Failed to update share settings')
  }

  return response.data as DocumentShareOwnerState
}

export const disableDocumentShare = async (workspaceId: string, noteId: string): Promise<DocumentShareOwnerState> => {
  const response = await tuyau.workspaces({ id: workspaceId }).notes({ noteId }).share.$delete()
  if (response.error) {
    throw toError(response.error, 'Failed to disable sharing')
  }

  return response.data as DocumentShareOwnerState
}
