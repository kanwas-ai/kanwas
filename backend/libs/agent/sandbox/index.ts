import { DockerSandbox } from './docker.js'
import { E2BSandbox } from './e2b.js'
import { type SandboxConfig, type SandboxInitOptions } from './types.js'
import type { BaseSandbox, SandboxMetrics } from './base.js'

export class SandboxManager {
  private sandbox: BaseSandbox | null = null
  private initOptions: SandboxInitOptions | null = null
  private initPromise: Promise<void> | null = null
  private initializationError: Error | null = null

  constructor(private config: SandboxConfig) {}

  /**
   * Set initialization options - call at start of agent execution.
   * Actual sandbox creation is deferred until first use.
   */
  setInitOptions(options: SandboxInitOptions): void {
    this.initOptions = options
    this.initializationError = null
  }

  setInitializationError(error: Error): void {
    this.initializationError = error
  }

  /**
   * Ensure sandbox is initialized - call before any sandbox operation.
   * Creates sandbox on first call, returns immediately on subsequent calls.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationError) {
      throw this.initializationError
    }

    if (this.sandbox) {
      if (this.sandbox.isPaused()) {
        await this.sandbox.resume()
      }

      if (this.sandbox.isReady()) {
        return
      }
    }

    if (!this.initOptions) {
      throw new Error('Sandbox init options not set. Call setInitOptions() first.')
    }

    // Use a promise to prevent concurrent initialization
    if (!this.initPromise) {
      this.initPromise = this.doInitialize().catch((error) => {
        this.initializationError = error instanceof Error ? error : new Error(String(error))
        this.initPromise = null
        throw error
      })
    }

    await this.initPromise
  }

  /**
   * Prepare for a sandbox operation - ensures initialized.
   */
  private async beforeOperation(): Promise<void> {
    await this.ensureInitialized()
  }

  private createSandbox(): BaseSandbox {
    return this.config.provider === 'docker' ? new DockerSandbox(this.config) : new E2BSandbox(this.config)
  }

  private async cleanupFailedSandbox(): Promise<void> {
    if (!this.sandbox) {
      return
    }

    try {
      await this.sandbox.shutdown()
    } catch {
      // Ignore cleanup errors; original initialization error is more important.
    } finally {
      this.sandbox = null
    }
  }

  private async doInitialize(): Promise<void> {
    if (!this.initOptions) {
      throw new Error('Sandbox init options not set')
    }

    this.sandbox = this.createSandbox()

    try {
      await this.sandbox.initialize(this.initOptions)
      this.initializationError = null
    } catch (error) {
      await this.cleanupFailedSandbox()
      throw error
    }
  }

  /**
   * Shutdown the sandbox - call in finally block
   */
  async shutdown(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.shutdown()
      this.sandbox = null
    }
    this.initPromise = null
  }

  /**
   * Check if sandbox is initialized and ready
   */
  isInitialized(): boolean {
    return this.sandbox?.isReady() ?? false
  }

  /**
   * Get the underlying sandbox instance (for advanced usage)
   */
  getSandbox(): BaseSandbox | null {
    return this.sandbox
  }

  /**
   * Get the sandbox ID (E2B only)
   */
  getSandboxId(): string | null {
    return this.sandbox?.getSandboxId() ?? null
  }

  /**
   * Get sandbox metrics and calculated cost (E2B only).
   * Returns null for Docker sandbox or if not initialized.
   */
  async getMetricsAndCost(): Promise<SandboxMetrics | null> {
    if (!this.sandbox) return null
    return this.sandbox.getMetricsAndCost()
  }

  async pause(): Promise<void> {
    if (this.initializationError) {
      return
    }

    if (this.initPromise) {
      try {
        await this.initPromise
      } catch {
        return
      }
    }

    if (!this.sandbox || this.sandbox.isPaused()) {
      return
    }

    await this.sandbox.pause()
  }

  async resume(): Promise<void> {
    if (this.initializationError) {
      return
    }

    if (this.initPromise) {
      try {
        await this.initPromise
      } catch {
        return
      }
    }

    if (!this.sandbox || !this.sandbox.isPaused()) {
      return
    }

    await this.sandbox.resume()
  }

  // File operation proxies - all auto-initialize and extend timeout
  async readFile(path: string): Promise<string> {
    await this.beforeOperation()
    return this.sandbox!.readFile(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.beforeOperation()
    return this.sandbox!.writeFile(path, content)
  }

  async fileExists(path: string): Promise<boolean> {
    await this.beforeOperation()
    return this.sandbox!.fileExists(path)
  }

  async isDirectory(path: string): Promise<boolean> {
    await this.beforeOperation()
    return this.sandbox!.isDirectory(path)
  }

  async listDirectory(path: string): Promise<string[]> {
    await this.beforeOperation()
    return this.sandbox!.listDirectory(path)
  }

  // Command execution proxy - auto-initializes and extends timeout
  async exec(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    await this.beforeOperation()
    return this.sandbox!.exec(command, options)
  }

  // Streaming command execution proxy - auto-initializes and extends timeout
  async execStreaming(
    command: string,
    options?: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    await this.beforeOperation()
    return this.sandbox!.execStreaming(command, options)
  }
}

export * from './types.js'
export { BaseSandbox, type SandboxMetrics } from './base.js'
export { DockerSandbox } from './docker.js'
export { E2BSandbox } from './e2b.js'
