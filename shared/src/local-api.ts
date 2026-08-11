/**
 * Browser-safe contracts shared by the Electron renderer and its embedded
 * local runtime. Keep this module data-only: importing it in the renderer
 * must never pull Node-only conversion or filesystem code into the bundle.
 */

export const LOCAL_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Local User',
} as const

export type LocalUser = typeof LOCAL_USER

export interface WorkspaceSummary {
  id: string
  /** Hyphen-free id used by the renderer route. */
  urlId: string
  name: string
  path: string
}

export type VaultStatus = 'mounted' | 'available' | 'missing' | 'error'

export interface VaultSummary extends WorkspaceSummary {
  label: string
  status: VaultStatus
  active: boolean
  lastOpenedAt: string
  error?: string
}

export interface YjsTokenResponse {
  token: string
  expiresAt: string
  socketPath: '/yjs/socket.io'
}

export interface UploadResponse {
  storagePath: string
  fileName: string
  mimeType: string
  size: number
}

export interface NoteSaveRequest {
  body: string
  baseHash?: string | null
  force?: boolean
}

export interface NoteBaselineResponse {
  hash: string | null
  relPath: string
}

export interface NoteSaveResponse {
  hash: string
  relPath: string
}

export interface NoteSaveConflict {
  diskHash: string | null
}

export interface FlushResponse {
  flushed: true
}

export interface LinkMetadataRequest {
  url: string
  canvasId: string
}

export interface LinkMetadataResponse {
  title?: string
  description?: string
  siteName?: string
  favicon?: string
  imageStoragePath?: string
}

export type TerminalAgentId = 'claude' | 'codex' | 'shell'

export interface TerminalAgent {
  id: TerminalAgentId
  command: string
  available: boolean
  version?: string
}

export interface TerminalSession {
  id: string
  title: string
  agent: TerminalAgentId
  command: string
  status: 'running' | 'exited'
  exitCode?: number
  createdAt: string
  cols: number
  rows: number
}

export interface CreateTerminalSessionRequest {
  agent: TerminalAgentId
  cols?: number
  rows?: number
  theme?: 'light' | 'dark'
}

export interface UiContextInput {
  activeCanvasId: string | null
  selectedNodeIds: string[]
  openDocument: { nodeId: string } | null
  textSelection: { nodeId: string; text: string } | null
}

export interface ResolvedFileRef {
  path: string
  startLine?: number
  endLine?: number
}

export interface EnrichedUiContext {
  activeCanvasId: string | null
  selectedNodeIds: string[]
  selectedPaths: string[]
  openDocument: { nodeId: string; path: string | null } | null
  textSelection: {
    nodeId: string
    text: string
    path: string | null
    startLine?: number
    endLine?: number
  } | null
  updatedAt: string | null
}

export interface LocalApiErrorBody {
  error: string
}

export interface KanwasDesktopBridge {
  readonly platform: 'darwin' | 'win32' | 'linux'
  listVaults(): Promise<VaultSummary[]>
  openVault(): Promise<WorkspaceSummary | null>
  activateVault(workspaceId: string): Promise<WorkspaceSummary>
  renameVaultLabel(workspaceId: string, label: string): Promise<WorkspaceSummary>
  forgetVault(workspaceId: string): Promise<void>
  onPrepareToQuit(callback: () => void): () => void
  readyToQuit(): void
}
