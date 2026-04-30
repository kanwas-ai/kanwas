import { Sandbox, CommandExitError, TimeoutError, type CommandHandle } from 'e2b'
import * as Sentry from '@sentry/node'
import { BaseSandbox, type SandboxMetrics } from './base.js'
import type { SandboxInitOptions } from './types.js'
import { E2B_PRICING } from '../tools/costs.js'
import { shellQuote } from '../tools/native_shared.js'

export class E2BSandbox extends BaseSandbox {
  private static readonly TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
  private static readonly SYNC_RUNNER_STARTUP_ATTEMPTS = 2

  private sandbox: Sandbox | null = null
  private paused = false

  private resolveTemplateId(): string {
    const configuredTemplateId = this.config.e2b?.templateId?.trim()
    if (configuredTemplateId) {
      console.log(`[E2BSandbox] Using configured template override: ${configuredTemplateId}`)
      return configuredTemplateId
    }

    const templateId = process.env.SANDBOX_E2B_TEMPLATE_ID?.trim()
    const railwayEnvironmentName = process.env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase()
    const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase()
    const environmentLabel = railwayEnvironmentName ?? nodeEnvironment ?? 'unknown'

    if (!templateId) {
      throw new Error(
        `[E2BSandbox] Missing SANDBOX_E2B_TEMPLATE_ID for environment "${environmentLabel}". ` +
          `Set SANDBOX_E2B_TEMPLATE_ID or provide sandbox.e2b.templateId.`
      )
    }

    console.log(`[E2BSandbox] Resolved template for environment "${environmentLabel}": ${templateId}`)
    return templateId
  }

  private async readSyncRunnerLogs(): Promise<string> {
    const logs = await this.runCommand('cat /tmp/sync-runner.log 2>/dev/null || echo "No logs available"')
    return logs.stdout
  }

  private async killRunnerIfStillRunning(handle: CommandHandle): Promise<void> {
    try {
      await handle.kill()
    } catch {
      // Ignore kill failures; process may have already exited.
    }
  }

  private buildRunnerExitError(
    runnerExit:
      | { type: 'result'; result: { exitCode: number; stdout: string; stderr: string } }
      | {
          type: 'error'
          error: unknown
        }
  ): Error {
    if (runnerExit.type === 'result') {
      const details = runnerExit.result.stderr || runnerExit.result.stdout
      return new Error(
        details
          ? `Sync runner exited before readiness marker (exitCode=${runnerExit.result.exitCode}): ${details.trim()}`
          : `Sync runner exited before readiness marker (exitCode=${runnerExit.result.exitCode})`
      )
    }

    if (runnerExit.error instanceof CommandExitError) {
      const details = runnerExit.error.stderr || runnerExit.error.stdout || runnerExit.error.message
      return new Error(
        `Sync runner exited before readiness marker (exitCode=${runnerExit.error.exitCode}): ${details.trim()}`
      )
    }

    if (runnerExit.error instanceof Error) {
      return new Error(`Sync runner failed before readiness marker: ${runnerExit.error.message}`)
    }

    return new Error(`Sync runner failed before readiness marker: ${String(runnerExit.error)}`)
  }

  private async waitForRunnerReady(runnerHandle: CommandHandle, readinessTimeoutMs: number): Promise<void> {
    let runnerExit:
      | { type: 'result'; result: { exitCode: number; stdout: string; stderr: string } }
      | { type: 'error'; error: unknown }
      | null = null

    const runnerWaitPromise = runnerHandle
      .wait()
      .then((result) => {
        runnerExit = { type: 'result', result }
      })
      .catch((error) => {
        runnerExit = { type: 'error', error }
      })

    const start = Date.now()
    while (Date.now() - start < readinessTimeoutMs) {
      if (runnerExit) {
        throw this.buildRunnerExitError(runnerExit)
      }

      const readyCheck = await this.runCommand('test -f /workspace/.ready')
      if (readyCheck.exitCode === 0) {
        this.ready = true
        return
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    if (!runnerExit) {
      await this.killRunnerIfStillRunning(runnerHandle)
      await runnerWaitPromise
    }

    if (runnerExit) {
      throw this.buildRunnerExitError(runnerExit)
    }

    throw new Error(`Sandbox failed to become ready within ${readinessTimeoutMs}ms`)
  }

  /**
   * Run a command and return the result, catching CommandExitError.
   * E2B SDK throws CommandExitError for non-zero exit codes, but we want
   * to return the result with stdout/stderr/exitCode for all commands.
   */
  private async runCommand(
    command: string,
    options?: {
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    if (!this.sandbox) throw new Error('Sandbox not initialized')

    let stdout = ''
    let stderr = ''

    const onStdout = async (data: string) => {
      stdout += data
      await options?.onStdout?.(data)
    }

    const onStderr = async (data: string) => {
      stderr += data
      await options?.onStderr?.(data)
    }

    try {
      const result = await this.sandbox.commands.run(command, {
        timeoutMs: options?.timeoutMs,
        onStdout,
        onStderr,
      })
      return {
        stdout: stdout || result.stdout,
        stderr: stderr || result.stderr,
        exitCode: result.exitCode,
      }
    } catch (error) {
      if (error instanceof CommandExitError) {
        return {
          stdout: stdout || error.stdout,
          stderr: stderr || error.stderr,
          exitCode: error.exitCode,
        }
      }
      if (error instanceof TimeoutError) {
        return {
          stdout,
          stderr,
          exitCode: 124,
          timedOut: true,
        }
      }
      // Report unexpected errors to Sentry
      Sentry.captureException(error, {
        tags: { component: 'e2b-sandbox', operation: 'run-command' },
        extra: { command, sandboxId: this.sandbox?.sandboxId },
      })
      throw error
    }
  }

  private async connectToExistingSandbox(sandboxId: string): Promise<Sandbox> {
    return Sandbox.connect(sandboxId, {
      timeoutMs: E2BSandbox.TIMEOUT_MS,
    })
  }

  private async waitForWorkspaceReady(): Promise<void> {
    const readinessTimeoutMs = this.getReadinessTimeoutMs()

    console.log(`[E2BSandbox] Waiting for sandbox to become ready...`)
    await this.waitForReady(async () => {
      const result = await this.runCommand('test -f /workspace/.ready')
      return result.exitCode === 0
    }, readinessTimeoutMs)
  }

  async initialize(options: SandboxInitOptions): Promise<void> {
    this.workspaceId = options.workspaceId
    const readinessTimeoutMs = this.getReadinessTimeoutMs()

    if (options.sandboxId) {
      console.log(`[E2BSandbox] Connecting to sandbox ${options.sandboxId}...`)
      this.ready = false
      this.paused = false
      this.sandbox = await this.connectToExistingSandbox(options.sandboxId)
      options.onSandboxId?.(this.sandbox.sandboxId)

      await this.waitForWorkspaceReady()

      console.log(`[E2BSandbox] Sandbox is ready: ${this.sandbox.sandboxId}`)
      return
    }

    const templateId = this.resolveTemplateId()

    console.log(`[E2BSandbox] Creating sandbox with template ${templateId}...`)
    const yjsServerHost = this.config.yjsServerHost
    if (!yjsServerHost) {
      throw new Error('Sandbox config is missing yjsServerHost')
    }

    console.log(`[E2BSandbox] Yjs server host: ${yjsServerHost}`)
    console.log(`[E2BSandbox] Yjs server protocol: ${this.config.yjsServerProtocol ?? 'wss'}`)
    console.log(`[E2BSandbox] Backend URL: ${this.config.backendUrl}`)

    // Create E2B sandbox with initial timeout
    this.sandbox = await Sandbox.create(templateId, {
      timeoutMs: E2BSandbox.TIMEOUT_MS,
      envs: {
        WORKSPACE_ID: this.workspaceId,
        YJS_SERVER_HOST: yjsServerHost,
        YJS_SERVER_PROTOCOL: this.config.yjsServerProtocol ?? 'wss',
        BACKEND_URL: this.config.backendUrl,
        AUTH_TOKEN: options.authToken,
        ASSEMBLYAI_API_KEY: this.config.assemblyaiApiKey ?? '',
        USER_ID: options.userId,
        CORRELATION_ID: options.correlationId,
        SENTRY_DSN: this.config.sentryDsn ?? '',
      },
    })
    this.paused = false

    options.onSandboxId?.(this.sandbox.sandboxId)

    console.log(`[E2BSandbox] Sandbox created: ${this.sandbox.sandboxId}`)

    // Configure AssemblyAI CLI if API key is provided
    if (this.config.assemblyaiApiKey) {
      console.log(`[E2BSandbox] Configuring AssemblyAI CLI in background...`)
      await this.runCommand(
        `nohup assemblyai config "${this.config.assemblyaiApiKey}" </dev/null > /tmp/assemblyai-config.log 2>&1 &`
      )
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= E2BSandbox.SYNC_RUNNER_STARTUP_ATTEMPTS; attempt++) {
      await this.runCommand('rm -f /workspace/.ready')

      console.log(
        `[E2BSandbox] Starting sync runner (attempt ${attempt}/${E2BSandbox.SYNC_RUNNER_STARTUP_ATTEMPTS})...`
      )
      const runnerHandle = await this.sandbox.commands.run(
        'sh -c "node /app/execenv/dist/index.js > /tmp/sync-runner.log 2>&1"',
        {
          background: true,
        }
      )

      try {
        console.log(`[E2BSandbox] Waiting for sandbox to become ready...`)
        await this.waitForRunnerReady(runnerHandle, readinessTimeoutMs)
        console.log(`[E2BSandbox] Sandbox is ready`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const logs = await this.readSyncRunnerLogs()
        console.error(`[E2BSandbox] Sync runner logs:\n${logs}`)

        if (attempt === E2BSandbox.SYNC_RUNNER_STARTUP_ATTEMPTS) {
          Sentry.captureException(lastError, {
            tags: { component: 'e2b-sandbox', phase: 'initialization' },
            extra: {
              sandboxId: this.sandbox?.sandboxId,
              syncRunnerLogs: logs,
              timeoutMs: readinessTimeoutMs,
              attempts: E2BSandbox.SYNC_RUNNER_STARTUP_ATTEMPTS,
            },
          })
          throw lastError
        }

        console.warn(
          `[E2BSandbox] Sync runner startup attempt ${attempt}/${E2BSandbox.SYNC_RUNNER_STARTUP_ATTEMPTS} failed: ${lastError.message}. Retrying...`
        )
      }
    }

    throw lastError ?? new Error('Sandbox failed to initialize')
  }

  override isPaused(): boolean {
    return this.paused
  }

  async pause(): Promise<void> {
    if (!this.sandbox || this.paused) {
      return
    }

    console.log(`[E2BSandbox] Pausing sandbox ${this.sandbox.sandboxId}...`)
    await this.sandbox.pause()
    this.paused = true
    console.log(`[E2BSandbox] Sandbox paused`)
  }

  async resume(): Promise<void> {
    if (!this.sandbox || !this.paused) {
      return
    }

    const sandboxId = this.sandbox.sandboxId
    console.log(`[E2BSandbox] Resuming sandbox ${sandboxId}...`)

    this.ready = false
    this.sandbox = await this.connectToExistingSandbox(sandboxId)
    await this.waitForWorkspaceReady()

    this.paused = false
    console.log(`[E2BSandbox] Sandbox resumed: ${sandboxId}`)
  }

  async getMetricsAndCost(): Promise<SandboxMetrics | null> {
    if (!this.sandbox) return null

    try {
      const metrics = await this.sandbox.getMetrics()
      if (metrics.length === 0) return null

      // Metrics are sampled every 5 seconds by E2B
      const intervalSeconds = 5

      let totalCpuCost = 0
      let totalMemoryCost = 0
      let totalCpuPercent = 0
      let maxMemoryBytes = 0
      const cpuCount = metrics[0].cpuCount

      for (const m of metrics) {
        // CPU cost for this interval: cpuCount * rate * interval
        totalCpuCost += cpuCount * E2B_PRICING.CPU_PER_VCPU_PER_SECOND * intervalSeconds

        // Memory cost for this interval (convert bytes to GiB)
        const memGiB = m.memUsed / (1024 * 1024 * 1024)
        totalMemoryCost += memGiB * E2B_PRICING.MEMORY_PER_GIB_PER_SECOND * intervalSeconds

        // Aggregate stats
        totalCpuPercent += m.cpuUsedPct
        maxMemoryBytes = Math.max(maxMemoryBytes, m.memUsed)
      }

      return {
        totalCostUsd: totalCpuCost + totalMemoryCost,
        durationSeconds: metrics.length * intervalSeconds,
        avgCpuPercent: totalCpuPercent / metrics.length,
        maxMemoryBytes,
        cpuCount,
      }
    } catch (error) {
      console.warn(`[E2BSandbox] Failed to get metrics: ${error}`)
      Sentry.captureException(error, {
        tags: { component: 'e2b-sandbox', operation: 'get-metrics' },
        extra: { sandboxId: this.sandbox?.sandboxId },
      })
      return null
    }
  }

  getSandboxId(): string | null {
    return this.sandbox?.sandboxId ?? null
  }

  async shutdown(): Promise<void> {
    if (this.sandbox) {
      const sandboxId = this.sandbox.sandboxId
      const sandbox = this.sandbox
      this.sandbox = null // Clear immediately to prevent double-shutdown
      this.ready = false
      this.paused = false

      console.log(`[E2BSandbox] Shutting down sandbox ${sandboxId}...`)
      try {
        await sandbox.kill()
      } catch (error) {
        // Sandbox may already be killed - that's fine
        console.log(`[E2BSandbox] Sandbox already killed or error: ${error}`)
      }
      console.log(`[E2BSandbox] Sandbox killed`)
    }
  }

  // File operations — paths are always single-quoted via shellQuote to neutralize shell metacharacters.
  async readFile(path: string): Promise<string> {
    const result = await this.runCommand(`cat ${shellQuote(path)}`)
    if (result.exitCode !== 0) throw new Error(result.stderr || 'File not found')
    return result.stdout
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Content is base64-encoded (no metacharacter risk); path is shell-quoted.
    const encoded = Buffer.from(content).toString('base64')
    const result = await this.runCommand(`echo ${shellQuote(encoded)} | base64 -d > ${shellQuote(path)}`)
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Write failed')
  }

  async fileExists(path: string): Promise<boolean> {
    if (!this.sandbox) return false
    const result = await this.runCommand(`test -e ${shellQuote(path)}`)
    return result.exitCode === 0
  }

  async isDirectory(path: string): Promise<boolean> {
    if (!this.sandbox) return false
    const result = await this.runCommand(`test -d ${shellQuote(path)}`)
    return result.exitCode === 0
  }

  async listDirectory(path: string): Promise<string[]> {
    const result = await this.runCommand(`ls -1 ${shellQuote(path)}`)
    if (result.exitCode !== 0) throw new Error(result.stderr || 'Directory not found')
    return result.stdout.trim().split('\n').filter(Boolean)
  }

  async exec(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    const workDir = options?.cwd ?? '/workspace'
    const fullCommand = `cd ${shellQuote(workDir)} && ${command}`
    return this.runCommand(fullCommand, { timeoutMs: options?.timeoutMs })
  }

  async execStreaming(
    command: string,
    options?: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    if (!this.sandbox) throw new Error('Sandbox not initialized')

    const workDir = options?.cwd ?? '/workspace'
    const fullCommand = `cd ${shellQuote(workDir)} && ${command}`
    console.log(`[E2BSandbox] execStreaming: ${command} (cwd: ${workDir})`)

    try {
      const result = await this.runCommand(fullCommand, {
        timeoutMs: options?.timeoutMs,
        onStdout: options?.onStdout,
        onStderr: options?.onStderr,
      })
      console.log(`[E2BSandbox] execStreaming: exitCode=${result.exitCode}`)
      return result
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'e2b-sandbox', operation: 'exec-streaming' },
        extra: { command, sandboxId: this.sandbox?.sandboxId },
      })
      throw error
    }
  }
}
