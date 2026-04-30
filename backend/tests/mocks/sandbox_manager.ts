import { SandboxManager, type SandboxMetrics, type SandboxInitOptions } from '#agent/sandbox/index'

const MOCK_SANDBOX_CONFIG = {
  provider: 'docker' as const,
  yjsServerHost: 'localhost:1999',
  yjsServerProtocol: 'ws' as const,
  backendUrl: 'http://localhost:3333',
}

export class MockSandboxManager extends SandboxManager {
  private initialized = false
  private mockInitOptions: SandboxInitOptions | null = null

  constructor() {
    super(MOCK_SANDBOX_CONFIG)
  }

  override setInitOptions(options: SandboxInitOptions): void {
    super.setInitOptions(options)
    this.mockInitOptions = options
  }

  getInitOptions(): SandboxInitOptions | null {
    return this.mockInitOptions
  }

  override async ensureInitialized(): Promise<void> {
    this.initialized = true
  }

  override isInitialized(): boolean {
    return this.initialized
  }

  override async shutdown(): Promise<void> {
    this.initialized = false
  }

  override getSandboxId(): string | null {
    return null
  }

  override async getMetricsAndCost(): Promise<SandboxMetrics | null> {
    return null
  }

  override async readFile(_path: string): Promise<string> {
    return ''
  }

  override async writeFile(_path: string, _content: string): Promise<void> {}

  override async fileExists(_path: string): Promise<boolean> {
    return false
  }

  override async isDirectory(_path: string): Promise<boolean> {
    return false
  }

  override async listDirectory(_path: string): Promise<string[]> {
    return []
  }

  override async exec(
    _command: string,
    _options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  override async execStreaming(
    _command: string,
    _options?: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (data: string) => void
      onStderr?: (data: string) => void
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }> {
    return { stdout: '', stderr: '', exitCode: 0 }
  }
}
