import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AgentRuntimeService from '#services/agent_runtime_service'
import { toError } from '#services/error_utils'

export default class AgentRuntimeRecover extends BaseCommand {
  static commandName = 'agent-runtime:recover'
  static description = 'Recover agent invocations whose runtime lease has expired'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    try {
      const agentRuntimeService = await this.app.container.make(AgentRuntimeService)
      const result = await agentRuntimeService.recoverStaleInvocations()

      if (result.recovered > 0) {
        this.logger.warning(`Recovered ${result.recovered} dead agent invocation(s)`)
      }
    } catch (error) {
      this.logger.error(`Failed to recover dead agent invocations: ${toError(error).message}`)
      this.exitCode = 1
    }
  }
}
