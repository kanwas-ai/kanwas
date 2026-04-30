import { resolveSandboxStartupConfig, type SandboxConfig, type SandboxInitOptions } from './types.js'

/**
 * Aggregated sandbox metrics with calculated cost.
 * Returned by getMetricsAndCost() for agent observability cost tracking.
 */
export interface SandboxMetrics {
  /** Total cost in USD (CPU + memory) */
  totalCostUsd: number
  /** Total duration in seconds */
  durationSeconds: number
  /** Average CPU usage percentage across all samples */
  avgCpuPercent: number
  /** Maximum memory usage in bytes */
  maxMemoryBytes: number
  /** Number of vCPUs (used for cost calculation) */
  cpuCount: number
}

export abstract class BaseSandbox {
  protected ready: boolean = false
  protected workspaceId: string | null = null

  constructor(protected config: SandboxConfig) {}

  abstract initialize(options: SandboxInitOptions): Promise<void>
  abstract shutdown(): Promise<void>
  abstract pause(): Promise<void>
  abstract resume(): Promise<void>
  abstract getMetricsAndCost(): Promise<SandboxMetrics | null>
  abstract getSandboxId(): string | null

  isPaused(): boolean {
    return false
  }

  // File operations
  abstract readFile(path: string): Promise<string>
  abstract writeFile(path: string, content: string): Promise<void>
  abstract fileExists(path: string): Promise<boolean>
  abstract isDirectory(path: string): Promise<boolean>
  abstract listDirectory(path: string): Promise<string[]>

  // Command execution
  abstract exec(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>

  // Streaming command execution
  abstract execStreaming(
    command: string,
    options?: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>

  isReady(): boolean {
    return this.ready
  }

  protected getReadinessTimeoutMs(): number {
    const startupConfig = resolveSandboxStartupConfig(this.config.startup)
    return startupConfig.readinessTimeoutMs
  }

  protected async waitForReady(checkFn: () => Promise<boolean>, timeout?: number): Promise<void> {
    const effectiveTimeout = timeout ?? this.getReadinessTimeoutMs()
    const start = Date.now()
    while (Date.now() - start < effectiveTimeout) {
      if (await checkFn()) {
        this.ready = true
        return
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    throw new Error(`Sandbox failed to become ready within ${effectiveTimeout}ms`)
  }
}
