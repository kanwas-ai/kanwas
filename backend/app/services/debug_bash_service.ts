import { inject } from '@adonisjs/core'
import { SandboxRegistry } from '#services/sandbox_registry'

export interface DebugBashResult {
  stdout: string
  stderr: string
  exitCode: number
  cwd: string
}

@inject()
export default class DebugBashService {
  constructor(private sandboxRegistry: SandboxRegistry) {}

  /**
   * Execute a command in the workspace's debug sandbox.
   * Creates a new debug sandbox if none exists.
   */
  async executeCommand(workspaceId: string, command: string, userId: string): Promise<DebugBashResult> {
    let entry = await this.sandboxRegistry.getDebugSandbox(workspaceId)

    // Create sandbox if none exists
    if (!entry) {
      entry = await this.sandboxRegistry.getOrCreateDebugSandbox(workspaceId, userId)
    }

    if (!entry) {
      throw new Error('Failed to create sandbox')
    }

    const { manager, cwd } = entry

    // Ensure sandbox is initialized
    if (!manager.isInitialized()) {
      await manager.ensureInitialized()
    }

    try {
      // Handle cd commands specially - need to track the new cwd
      const cdMatch = command.trim().match(/^cd(\s+(.*))?$/)
      if (cdMatch) {
        // Run cd and pwd together to get the new directory
        const target = cdMatch[2]?.trim() || '~'
        const cdCommand = `cd ${target} && pwd`
        const result = await manager.exec(cdCommand, { cwd })

        if (result.exitCode === 0) {
          const newCwd = result.stdout.trim()
          await this.sandboxRegistry.updateDebugCwd(workspaceId, newCwd)
          if (entry) {
            entry.cwd = newCwd
          }
          return {
            stdout: '', // cd doesn't produce output
            stderr: result.stderr,
            exitCode: 0,
            cwd: newCwd,
          }
        } else {
          return {
            stdout: '',
            stderr: result.stderr || `cd: ${target}: No such file or directory`,
            exitCode: result.exitCode,
            cwd,
          }
        }
      }

      const result = await manager.exec(command, { cwd })

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd: entry?.cwd || cwd,
      }
    } catch (error) {
      // Handle errors (like CommandExitError from E2B)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        stdout: '',
        stderr: errorMessage,
        exitCode: 1,
        cwd: entry?.cwd || cwd,
      }
    }
  }

  /**
   * Check if a sandbox is available for a workspace
   */
  async hasSandbox(workspaceId: string): Promise<boolean> {
    return this.sandboxRegistry.hasDebugSandbox(workspaceId)
  }

  /**
   * Get the current working directory for a workspace's sandbox
   */
  async getCwd(workspaceId: string): Promise<string> {
    const entry = await this.sandboxRegistry.getDebugSandbox(workspaceId)
    return entry?.cwd ?? '/workspace'
  }

  /**
   * Check if agent is running for a workspace
   */
  async isAgentRunning(workspaceId: string): Promise<boolean> {
    return this.sandboxRegistry.hasInvocationForWorkspace(workspaceId)
  }

  /**
   * Shutdown the debug sandbox.
   * Called when the debug shell is closed.
   */
  async shutdownDebugSandbox(workspaceId: string): Promise<boolean> {
    return this.sandboxRegistry.shutdownDebugSandbox(workspaceId)
  }
}
