import redis from '@adonisjs/redis/services/main'
import { SocketChannels } from '#types/socketio'

type CancelOperationCommand = {
  type: 'cancel_operation'
  reason?: string
}

export type AgentCommand = CancelOperationCommand

export default class AgentCommandService {
  async publish(invocationId: string, command: AgentCommand): Promise<number> {
    const channel = SocketChannels.agentCommands(invocationId)
    return redis.publish(channel, JSON.stringify(command))
  }
}
