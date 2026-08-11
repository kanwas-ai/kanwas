/**
 * Minimal API types for execenv.
 * Avoids importing from backend which pulls in all backend source files during type-checking.
 */

export interface SignedUrlResponse {
  url: string
}

export interface FileUploadResponse {
  storagePath: string
  mimeType: string
  size: number
}

export interface WorkspaceMemberResponse {
  userId: string
  name: string
  email: string
}

export interface AuthMeResponse {
  id: string
  name: string
  email: string
}
