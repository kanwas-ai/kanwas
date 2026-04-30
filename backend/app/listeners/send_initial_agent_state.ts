import { SocketioServer } from '#contracts/socketio_server'
import { inject } from '@adonisjs/core'
import InvocationSubscribed from '#events/invocation_subscribed'
import Invocation from '#models/invocation'
import { SocketServerEvents } from '#types/socketio'
import { ContextualLogger } from '#services/contextual_logger'
import { withSentryContext } from '#services/sentry_context'
import { toError } from '#services/error_utils'

@inject()
export default class SendInitialAgentState {
  constructor(protected socketio: SocketioServer) {}

  async handle(event: InvocationSubscribed) {
    const { invocationId, channel, socketId } = event

    return withSentryContext(
      {
        component: 'SendInitialAgentState',
        operation: 'send_initial_state',
      },
      async () => {
        const logger = ContextualLogger.createFallback({ component: 'SendInitialAgentState' })

        try {
          // Load invocation from database
          const invocation = await Invocation.find(invocationId)

          if (!invocation) {
            return
          }

          if (invocation.agentState) {
            const target = socketId ?? channel
            this.socketio.to(target).emit(SocketServerEvents.AGENT_MESSAGE, invocation.agentState)
            logger.info({ invocationId, channel, socketId }, 'Sent initial agent state')
          }
        } catch (error) {
          logger.error({ invocationId, err: toError(error) }, 'Error sending initial agent state')
        }
      }
    )
  }
}
