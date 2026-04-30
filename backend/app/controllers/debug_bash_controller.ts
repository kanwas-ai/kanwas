import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import DebugBashService from '#services/debug_bash_service'
import vine from '@vinejs/vine'

const executeBashValidator = vine.compile(
  vine.object({
    command: vine.string().minLength(1).maxLength(10000),
  })
)

@inject()
export default class DebugBashController {
  constructor(private debugBashService: DebugBashService) {}

  /**
   * POST /workspaces/:id/debug/bash
   * Execute a command in the workspace's debug sandbox
   */
  async execute({ params, request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspaceId = params.id

    const data = await request.validateUsing(executeBashValidator)

    const result = await this.debugBashService.executeCommand(workspaceId, data.command, user.id)

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      cwd: result.cwd,
    }
  }

  /**
   * GET /workspaces/:id/debug/sandbox-status
   * Check if a debug sandbox is available for this workspace
   */
  async status({ params }: HttpContext) {
    const workspaceId = params.id

    return {
      available: await this.debugBashService.hasSandbox(workspaceId),
      agentRunning: await this.debugBashService.isAgentRunning(workspaceId),
      cwd: await this.debugBashService.getCwd(workspaceId),
    }
  }

  /**
   * POST /workspaces/:id/debug/shutdown
   * Shutdown the debug sandbox.
   * Called when the debug shell is closed.
   */
  async shutdown({ params }: HttpContext) {
    const workspaceId = params.id

    const wasShutdown = await this.debugBashService.shutdownDebugSandbox(workspaceId)

    return {
      shutdown: wasShutdown,
    }
  }
}
