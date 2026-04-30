export type DocumentShareAccessMode = 'readonly' | 'editable'

function toUrlUuid(uuid: string): string {
  return uuid.replace(/-/g, '')
}

export function buildDocumentSharePath(longHashId: string): string {
  return `/share/${encodeURIComponent(longHashId)}`
}

export function buildWorkspaceRootPath(workspaceId: string): string {
  return `/w/${toUrlUuid(workspaceId)}`
}

export interface DocumentShareRecord {
  id: string
  workspaceId: string
  noteId: string
  name: string
  createdByUserId: string
  longHashId: string
  accessMode: DocumentShareAccessMode
  publicPath: string
  workspaceRedirectPath: string
  createdAt: string
  updatedAt: string
}

export interface DocumentShareOwnerState {
  workspaceId: string
  noteId: string
  workspaceRedirectPath: string
  active: boolean
  share: DocumentShareRecord | null
}

export interface WorkspaceDocumentSharesState {
  workspaceId: string
  shares: DocumentShareRecord[]
}

export interface ActivePublicDocumentShare {
  longHashId: string
  workspaceId: string
  noteId: string
  name: string
  accessMode: DocumentShareAccessMode
  publicPath: string
  workspaceRedirectPath: string
  active: true
  revoked: false
  status: 'active'
}

export interface RevokedPublicDocumentShare {
  longHashId: string
  workspaceId: string
  noteId: string
  name: string
  accessMode: DocumentShareAccessMode
  publicPath: string
  workspaceRedirectPath: string
  active: false
  revoked: true
  status: 'revoked'
}

export interface MissingPublicDocumentShare {
  longHashId: string
  publicPath: string
  active: false
  revoked: false
  status: 'not_found'
}

export type PublicDocumentShareResolveResult =
  | ActivePublicDocumentShare
  | RevokedPublicDocumentShare
  | MissingPublicDocumentShare

export interface ActiveDocumentShareSocketAccess {
  longHashId: string
  workspaceId: string
  noteId: string
  accessMode: DocumentShareAccessMode
  active: true
  revoked: false
  status: 'active'
}

export interface RevokedDocumentShareSocketAccess {
  longHashId: string
  workspaceId: string
  noteId: string
  accessMode: DocumentShareAccessMode
  active: false
  revoked: true
  status: 'revoked'
}

export interface MissingDocumentShareSocketAccess {
  longHashId: string
  active: false
  revoked: false
  status: 'not_found'
}

export type DocumentShareSocketAccessResolveResult =
  | ActiveDocumentShareSocketAccess
  | RevokedDocumentShareSocketAccess
  | MissingDocumentShareSocketAccess
