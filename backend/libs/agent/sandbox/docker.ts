import { exec, spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { BaseSandbox, type SandboxMetrics } from './base.js'
import type { SandboxInitOptions } from './types.js'

const execAsync = promisify(exec)

function findProjectRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  let dir = currentDir

  // Walk up until we find execenv/Dockerfile
  while (dir !== '/') {
    if (existsSync(join(dir, 'execenv', 'Dockerfile'))) {
      return dir
    }
    dir = dirname(dir)
  }

  throw new Error('Could not find project root (looking for execenv/Dockerfile)')
}

export class DockerSandbox extends BaseSandbox {
  private containerId: string | null = null
  private logProcess: ChildProcess | null = null

  private runDockerExec(
    command: string,
    options?: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    if (!this.containerId) {
      throw new Error('Container not initialized')
    }

    const workDir = options?.cwd ?? '/workspace'

    return new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec', '-i', '-w', workDir, this.containerId!, 'sh'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let resolved = false

      const timer =
        options?.timeoutMs && options.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              child.kill('SIGKILL')
            }, options.timeoutMs)
          : null

      const finish = (result: { stdout: string; stderr: string; exitCode: number; timedOut?: boolean }) => {
        if (resolved) {
          return
        }

        resolved = true
        if (timer) {
          clearTimeout(timer)
        }
        resolve(result)
      }

      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        stdout += text
        options?.onStdout?.(text)
      })

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        options?.onStderr?.(text)
      })

      child.on('error', (err) => {
        if (timer) {
          clearTimeout(timer)
        }
        if (!resolved) {
          console.log(`[DockerSandbox] exec: error=${err.message}`)
          reject(err)
        }
      })

      child.on('close', (code) => {
        const exitCode = timedOut ? 124 : (code ?? 0)
        console.log(`[DockerSandbox] exec: exitCode=${exitCode}`)
        finish({
          stdout,
          stderr,
          exitCode,
          timedOut: timedOut || undefined,
        })
      })

      child.stdin.write(command)
      child.stdin.end()
    })
  }

  private async dockerExecArgv(
    args: string[],
    options?: { stdin?: string | Buffer }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.containerId) {
      throw new Error('Container not initialized')
    }
    return new Promise((resolve, reject) => {
      const child = spawn('docker', [
        'exec',
        ...(options?.stdin !== undefined ? ['-i'] : []),
        this.containerId!,
        ...args,
      ])
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      })
      if (options?.stdin !== undefined) {
        child.stdin.write(options.stdin)
        child.stdin.end()
      }
    })
  }

  private runDockerCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', args)
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      })
    })
  }

  async initialize(options: SandboxInitOptions): Promise<void> {
    this.workspaceId = options.workspaceId
    if (options.sandboxId) {
      this.containerId = options.sandboxId
      options.onSandboxId?.(this.containerId)
      console.log(`[DockerSandbox] Attaching to container ${this.containerId}...`)

      const inspectResult = await this.runDockerCli(['inspect', '-f', '{{.State.Running}}', this.containerId])
      if (inspectResult.exitCode !== 0 || inspectResult.stdout.trim() !== 'true') {
        const details = (inspectResult.stderr || inspectResult.stdout).trim()
        this.containerId = null
        throw new Error(
          details
            ? `Docker container ${options.sandboxId} is not available: ${details}`
            : `Docker container ${options.sandboxId} is not available`
        )
      }

      this.logProcess = spawn('docker', ['logs', '-f', this.containerId], {
        stdio: ['ignore', 'inherit', 'inherit'],
      })

      console.log(`[DockerSandbox] Waiting for sandbox to become ready...`)
      await this.waitForReady(async () => {
        const result = await this.dockerExecArgv(['test', '-f', '/workspace/.ready'])
        return result.exitCode === 0
      })

      console.log(`[DockerSandbox] Sandbox is ready`)
      return
    }

    const imageName = this.config.docker?.imageName ?? 'kanwas-execenv'
    const buildContext = this.config.docker?.buildContext ?? findProjectRoot()

    // 1. Build image (from project root to include shared/)
    console.log(`[DockerSandbox] Building image ${imageName}...`)
    const dockerfilePath = join(buildContext, 'execenv', 'Dockerfile')
    await execAsync(`docker build -t ${imageName} -f ${dockerfilePath} ${buildContext}`)

    // 2. Start container in detached mode (keep alive with tail)
    const containerName = `kanwas-sandbox-${this.workspaceId}-${Date.now()}`
    console.log(`[DockerSandbox] Starting container ${containerName}...`)

    // Replace localhost with host.docker.internal for Docker networking
    const rawYjsServerHost = this.config.yjsServerHost
    if (!rawYjsServerHost) {
      throw new Error('Sandbox config is missing yjsServerHost')
    }

    const yjsServerHost = rawYjsServerHost.replace(/^localhost(:\d+)?$/, 'host.docker.internal$1')
    const backendUrl = this.config.backendUrl.replace(/localhost(:\d+)?/, 'host.docker.internal$1')

    const { stdout } = await execAsync(
      `docker run -d ` +
        `--name ${containerName} ` +
        `-e WORKSPACE_ID=${this.workspaceId} ` +
        `-e YJS_SERVER_HOST=${yjsServerHost} ` +
        `-e YJS_SERVER_PROTOCOL=${this.config.yjsServerProtocol ?? 'ws'} ` +
        `-e BACKEND_URL=${backendUrl} ` +
        `-e AUTH_TOKEN=${options.authToken} ` +
        `-e ASSEMBLYAI_API_KEY=${this.config.assemblyaiApiKey ?? ''} ` +
        `-e USER_ID=${options.userId} ` +
        `-e CORRELATION_ID=${options.correlationId} ` +
        `-e SENTRY_DSN=${this.config.sentryDsn ?? ''} ` +
        `${imageName} ` +
        `tail -f /dev/null`
    )

    this.containerId = stdout.trim()
    options.onSandboxId?.(this.containerId)
    console.log(`[DockerSandbox] Container started: ${this.containerId}`)

    // Start streaming container logs to console
    this.logProcess = spawn('docker', ['logs', '-f', this.containerId], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    // 3. Wait for .ready marker (entrypoint.sh starts the sync runner automatically)
    console.log(`[DockerSandbox] Waiting for sandbox to become ready...`)
    await this.waitForReady(async () => {
      const result = await this.dockerExecArgv(['test', '-f', '/workspace/.ready'])
      return result.exitCode === 0
    })

    console.log(`[DockerSandbox] Sandbox is ready`)
  }

  async shutdown(): Promise<void> {
    if (this.logProcess) {
      this.logProcess.kill()
      this.logProcess = null
    }
    if (this.containerId) {
      const containerId = this.containerId
      this.containerId = null // Clear immediately to prevent double-shutdown
      this.ready = false

      console.log(`[DockerSandbox] Shutting down container ${containerId}...`)
      await execAsync(`docker stop ${containerId}`).catch(() => {})
      await execAsync(`docker rm ${containerId}`).catch(() => {})
      console.log(`[DockerSandbox] Container stopped and removed`)
    }
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}

  async getMetricsAndCost(): Promise<SandboxMetrics | null> {
    // Docker sandbox doesn't have a metrics API like E2B
    return null
  }

  getSandboxId(): string | null {
    return this.containerId
  }

  // File operations — all use argv form to avoid shell metacharacter injection in paths.
  async readFile(path: string): Promise<string> {
    if (!this.containerId) throw new Error('Container not initialized')
    console.log(`[DockerSandbox] readFile: ${path}`)
    const { stdout, stderr, exitCode } = await this.dockerExecArgv(['cat', path])
    if (exitCode !== 0) throw new Error(stderr || `readFile failed with exit ${exitCode}`)
    return stdout
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.containerId) throw new Error('Container not initialized')
    console.log(`[DockerSandbox] writeFile: ${path} (${content.length} bytes)`)
    // `sh -c 'cat > "$1"' sh <path>` passes the path as $1 (argv), not interpolated into the command.
    const { stderr, exitCode } = await this.dockerExecArgv(['sh', '-c', 'cat > "$1"', 'sh', path], { stdin: content })
    if (exitCode !== 0) throw new Error(stderr || `writeFile failed with exit ${exitCode}`)
  }

  async fileExists(path: string): Promise<boolean> {
    if (!this.containerId) return false
    const { exitCode } = await this.dockerExecArgv(['test', '-e', path])
    const exists = exitCode === 0
    console.log(`[DockerSandbox] fileExists: ${path} -> ${exists}`)
    return exists
  }

  async isDirectory(path: string): Promise<boolean> {
    if (!this.containerId) return false
    const { exitCode } = await this.dockerExecArgv(['test', '-d', path])
    const isDir = exitCode === 0
    console.log(`[DockerSandbox] isDirectory: ${path} -> ${isDir}`)
    return isDir
  }

  async listDirectory(path: string): Promise<string[]> {
    if (!this.containerId) throw new Error('Container not initialized')
    console.log(`[DockerSandbox] listDirectory: ${path}`)
    const { stdout, stderr, exitCode } = await this.dockerExecArgv(['ls', '-1', path])
    if (exitCode !== 0) throw new Error(stderr || `listDirectory failed with exit ${exitCode}`)
    const entries = stdout.trim().split('\n').filter(Boolean)
    console.log(`[DockerSandbox] listDirectory: found ${entries.length} entries`)
    return entries
  }

  async exec(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    const workDir = options?.cwd ?? '/workspace'
    console.log(`[DockerSandbox] exec: ${command} (cwd: ${workDir})`)
    return this.runDockerExec(command, options)
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
    const workDir = options?.cwd ?? '/workspace'
    console.log(`[DockerSandbox] execStreaming: ${command} (cwd: ${workDir})`)
    return this.runDockerExec(command, options)
  }
}
