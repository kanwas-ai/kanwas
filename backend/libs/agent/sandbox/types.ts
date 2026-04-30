export interface SandboxConfig {
  provider: 'docker' | 'e2b'
  yjsServerHost?: string
  yjsServerProtocol?: 'ws' | 'wss'
  /** Backend API URL for file operations (images, etc.) */
  backendUrl: string
  /** AssemblyAI API key for audio/video transcription */
  assemblyaiApiKey?: string
  /** Sentry DSN for error tracking in sandbox */
  sentryDsn?: string

  docker?: {
    imageName?: string // default: 'kanwas-execenv'
    buildContext?: string // default: project root
  }

  e2b?: {
    templateId?: string // default: 'kanwas-execenv'
  }

  startup?: Partial<SandboxStartupConfig>
}

export interface SandboxStartupConfig {
  readinessTimeoutMs: number
}

export const DEFAULT_SANDBOX_STARTUP_CONFIG: SandboxStartupConfig = {
  readinessTimeoutMs: 60_000,
}

export function resolveSandboxStartupConfig(startup: Partial<SandboxStartupConfig> | undefined): SandboxStartupConfig {
  return {
    readinessTimeoutMs: startup?.readinessTimeoutMs ?? DEFAULT_SANDBOX_STARTUP_CONFIG.readinessTimeoutMs,
  }
}

export interface SandboxInitOptions {
  workspaceId: string
  /** Auth token for backend API - used for file operations in sandbox */
  authToken: string
  /** User ID for context propagation */
  userId: string
  /** Correlation ID for end-to-end tracing */
  correlationId: string
  /** Existing sandbox ID to connect to (E2B only) */
  sandboxId?: string
  /**
   * Optional callback invoked as soon as a sandbox ID is available (before ready).
   * Useful for persisting the sandbox ID to a registry for later attach/shutdown.
   */
  onSandboxId?: (id: string) => void
}
