import { CanvasAgent, type ConnectedExternalTool } from '#agent/index'
import { hasUserLlmOverrides, resolveProviderFromUserConfig } from '#agent/providers/user_config'
import { SocketioServer } from '#contracts/socketio_server'
import AgentInvoked from '#events/agent_invoked'
import Invocation from '#models/invocation'
import User from '#models/user'
import Workspace from '#models/workspace'
import BackgroundAgentExecutionService from '#services/background_agent_execution_service'
import AgentRuntimeService from '#services/agent_runtime_service'
import ComposioService, { type ConnectionStatus } from '#services/composio_service'
import { SocketChannels, SocketServerEvents, type AgentSocketMessage } from '#types/socketio'
import redis from '@adonisjs/redis/services/main'
import { CommandSchema } from '#validators/agent_invocation'
import { inject } from '@adonisjs/core'
import { ContextualLogger } from '#services/contextual_logger'
import { withSentryContext } from '#services/sentry_context'
import { toError } from '#services/error_utils'
import app from '@adonisjs/core/services/app'
import TaskLifecycleService, { mapAgentTerminalEventToTaskStatus } from '#services/task_lifecycle_service'
import InvocationCompleted from '#events/invocation_completed'
import UserConfigService from '#services/user_config_service'
import { normalizeAgentMode } from '#agent/modes'
import agentConfig from '#config/agent'

export const getAgentCommandsChannel = SocketChannels.agentCommands

type StartAgentLogger = ReturnType<typeof ContextualLogger.createFallback>
type AgentEventStream = ReturnType<CanvasAgent['getEventStream']>
type AgentStateSaver = {
  queue: (message: AgentSocketMessage, source: string) => Promise<void> | null
  flush: () => Promise<void>
}
type AgentEventSubscription = {
  flushTaskStatusUpdates: () => Promise<void>
  dispose: () => void
}

@inject()
export default class StartAgent {
  constructor(
    protected socketio: SocketioServer,
    protected taskLifecycleService: TaskLifecycleService,
    protected agentRuntimeService: AgentRuntimeService,
    protected backgroundAgentExecutionService: BackgroundAgentExecutionService,
    protected composioService: ComposioService
  ) {}

  private getAgentAuditMetadata(userId: string): { auditActor: string; auditTimestamp: string } {
    return {
      auditActor: `agent:${userId}`,
      auditTimestamp: new Date().toISOString(),
    }
  }

  private resolveTaskTerminalStatus(
    lastEventType: string | undefined,
    executionError: unknown
  ): 'complete' | 'error' | null {
    const mappedStatus = mapAgentTerminalEventToTaskStatus(lastEventType)

    if (mappedStatus) {
      return mappedStatus
    }

    if (executionError) {
      return 'error'
    }

    return null
  }

  private resolveTaskRealtimeStatus(eventType: string | undefined): 'processing' | 'waiting' | null {
    if (eventType === 'ask_question_created') {
      return 'waiting'
    }

    if (eventType === 'ask_question_answered' || eventType === 'ask_question_cancelled') {
      return 'processing'
    }

    return null
  }

  private async updateTaskFromAgentEvent(
    params: {
      invocationId: string
      eventType: string | undefined
    },
    logger: StartAgentLogger
  ) {
    const nextStatus = this.resolveTaskRealtimeStatus(params.eventType)

    if (!nextStatus) {
      return
    }

    try {
      if (nextStatus === 'waiting') {
        await this.taskLifecycleService.markInvocationWaiting(params.invocationId)
        return
      }

      await this.taskLifecycleService.markInvocationProcessing(params.invocationId)
    } catch (error) {
      logger.error(
        {
          invocationId: params.invocationId,
          eventType: params.eventType,
          status: nextStatus,
          err: toError(error),
        },
        'Failed to update task realtime status'
      )
    }
  }

  private async updateTaskAfterExecution(
    params: {
      invocationId: string
      lastEventType: string | undefined
      executionError: unknown
    },
    logger: StartAgentLogger
  ) {
    const nextStatus = this.resolveTaskTerminalStatus(params.lastEventType, params.executionError)

    if (!nextStatus) {
      return
    }

    try {
      await this.taskLifecycleService.markInvocationTerminal(params.invocationId, nextStatus)
    } catch (error) {
      logger.error(
        {
          invocationId: params.invocationId,
          status: nextStatus,
          err: toError(error),
        },
        'Failed to update task terminal status'
      )
    }
  }

  private async hydrateFromParentInvocationIfAny(invocation: Invocation, agent: CanvasAgent, logger: StartAgentLogger) {
    if (!invocation.parentInvocationId) {
      return
    }

    logger.info({ parentInvocationId: invocation.parentInvocationId }, 'Loading state from parent invocation')
    await invocation.load('parentInvocation')

    if (invocation.parentInvocation.agentState) {
      logger.debug({ agentState: invocation.parentInvocation.agentState }, 'Loaded parent invocation state')
      agent.loadState(invocation.parentInvocation.agentState.state)

      try {
        const changed = await agent.refreshPersistedAttachmentUrls({ logger })
        if (changed) {
          logger.info(
            { parentInvocationId: invocation.parentInvocationId },
            'Re-signed attachment URLs in replayed history'
          )
        }
      } catch (error) {
        logger.warn(
          { parentInvocationId: invocation.parentInvocationId, err: toError(error) },
          'Failed to refresh attachment URLs; continuing'
        )
      }
    }
  }

  private async hydrateFromInvocationState(invocation: Invocation, agent: CanvasAgent, logger: StartAgentLogger) {
    if (!invocation.agentState) {
      return
    }

    logger.info({ invocationId: invocation.id }, 'Loading state from current invocation')
    agent.loadState(invocation.agentState.state)

    try {
      const changed = await agent.refreshPersistedAttachmentUrls({ logger })
      if (changed) {
        logger.info({ invocationId: invocation.id }, 'Re-signed attachment URLs in replayed history')
      }
    } catch (error) {
      logger.warn({ invocationId: invocation.id, err: toError(error) }, 'Failed to refresh attachment URLs; continuing')
    }
  }

  private async subscribeToInvocationCommands(invocation: Invocation, agent: CanvasAgent, logger: StartAgentLogger) {
    const channel = getAgentCommandsChannel(invocation.id)
    const connection = redis.connection()
    const handler = async (message: string) => {
      await this.handleInvocationCommand(message, agent, logger)
    }

    await new Promise<void>((resolve, reject) => {
      connection.subscribe(channel, handler, {
        onSubscription: () => resolve(),
        onError: reject,
      })
    })

    return async () => {
      await connection.unsubscribe(channel, handler)
    }
  }

  private async handleInvocationCommand(message: string, agent: CanvasAgent, logger: StartAgentLogger) {
    logger.debug({ message }, 'Received Redis command')
    const command = await CommandSchema.validate(JSON.parse(message))
    logger.debug({ commandType: command.type }, 'Validated Redis command')

    if (command.type === 'cancel_operation') {
      agent.getState().abort(command.reason)
    }
  }

  private async applyUserLlmOverrides(agent: CanvasAgent, userId: string, logger: StartAgentLogger) {
    try {
      const userConfigService = new UserConfigService()
      const userConfig = await userConfigService.getConfig(userId)
      const hasOverrides = hasUserLlmOverrides(userConfig)

      if (hasOverrides) {
        const provider = resolveProviderFromUserConfig(userConfig, { logger })
        agent.overrideProvider(provider)
        logger.info(
          {
            llmProvider: userConfig.llmProvider,
            llmModel: userConfig.llmModel,
            reasoningEffort: userConfig.reasoningEffort,
          },
          'Applied effective LLM config'
        )
      }
    } catch (error) {
      logger.warn({ err: toError(error) }, 'Failed to read user LLM config, using default')
    }
  }

  private normalizeConnectedExternalTools(connections: ConnectionStatus[]): ConnectedExternalTool[] {
    const toolsByToolkit = new Map<string, ConnectedExternalTool>()

    for (const connection of connections) {
      if (!connection.isConnected || !connection.connectedAccountId) {
        continue
      }

      const toolkit = connection.toolkit.trim().toLowerCase()
      if (!toolkit) {
        continue
      }

      const displayName = connection.displayName?.trim() || connection.toolkit.trim()
      if (!displayName) {
        continue
      }

      if (!toolsByToolkit.has(toolkit)) {
        toolsByToolkit.set(toolkit, { toolkit, displayName })
      }
    }

    return [...toolsByToolkit.values()].sort((left, right) => {
      const byDisplayName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
      return byDisplayName || left.toolkit.localeCompare(right.toolkit)
    })
  }

  private async resolveConnectedExternalToolsContext(
    params: { userId: string; workspaceId: string },
    logger: StartAgentLogger
  ): Promise<{
    connectedExternalTools: ConnectedExternalTool[] | null
    connectedExternalToolsLookupCompleted: boolean
  }> {
    if (!agentConfig.connectedExternalTools.enabled) {
      return {
        connectedExternalTools: null,
        connectedExternalToolsLookupCompleted: false,
      }
    }

    try {
      const connections = await this.composioService.listWorkspaceConnectedToolkits(params.userId, params.workspaceId)

      return {
        connectedExternalTools: this.normalizeConnectedExternalTools(connections),
        connectedExternalToolsLookupCompleted: true,
      }
    } catch (error) {
      logger.warn(
        {
          userId: params.userId,
          workspaceId: params.workspaceId,
          err: toError(error),
        },
        'Failed to load connected external tools; omitting context'
      )

      return {
        connectedExternalTools: null,
        connectedExternalToolsLookupCompleted: false,
      }
    }
  }

  private async buildPreparedAgentExecution(
    invocation: Invocation,
    eventContext: AgentInvoked['context'],
    logger: StartAgentLogger
  ) {
    const [user, sessionId, workspace] = await Promise.all([
      User.find(invocation.userId),
      this.taskLifecycleService.resolveRootInvocationIdForScope(
        invocation.id,
        invocation.workspaceId,
        invocation.userId
      ),
      Workspace.findOrFail(invocation.workspaceId),
    ])
    if (!user) {
      throw new Error(`User not found: ${invocation.userId}`)
    }

    const { auditActor, auditTimestamp } = this.getAgentAuditMetadata(invocation.userId)
    const userName = user.name?.trim() || null
    const connectedExternalToolsContext = await this.resolveConnectedExternalToolsContext(
      {
        userId: invocation.userId,
        workspaceId: invocation.workspaceId,
      },
      logger
    )

    return this.backgroundAgentExecutionService.prepareExecution({
      user,
      workspace,
      invocationId: invocation.id,
      aiSessionId: sessionId,
      correlationId: eventContext.correlationId,
      tokenExpiresIn: '2 hours',
      contextOverrides: {
        canvasId: invocation.canvasId,
        userName,
        auditActor,
        auditTimestamp,
        uploadedFiles: invocation.files || null,
        agentMode: normalizeAgentMode(invocation.mode),
        yoloMode: invocation.yoloMode || false,
        selectedText: invocation.selectedText || null,
        invocationSource: invocation.source ?? null,
        workspaceTree: invocation.workspaceTree || null,
        canvasPath: invocation.canvasPath ?? null,
        activeCanvasContext: invocation.activeCanvasContext ?? null,
        selectedNodePaths: invocation.selectedNodePaths || null,
        mentionedNodePaths: invocation.mentionedNodePaths || null,
        ...connectedExternalToolsContext,
      },
    })
  }

  private createInvocationStateSaver(
    invocation: Invocation,
    invocationId: string,
    ownerId: string,
    logger: StartAgentLogger
  ): AgentStateSaver {
    let agentStateSaveInFlight: Promise<void> | null = null
    let pendingAgentState: { message: AgentSocketMessage; source: string } | null = null

    const queue = (message: AgentSocketMessage, source: string) => {
      pendingAgentState = { message, source }

      if (!agentStateSaveInFlight) {
        agentStateSaveInFlight = (async () => {
          try {
            while (pendingAgentState) {
              const currentSave = pendingAgentState
              pendingAgentState = null

              try {
                const persisted = await this.agentRuntimeService.persistAgentStateIfOwned(
                  invocationId,
                  ownerId,
                  currentSave.message
                )
                if (persisted) {
                  invocation.agentState = currentSave.message
                }
              } catch (error) {
                logger.error(
                  {
                    invocationId,
                    eventType: currentSave.message.event.type,
                    source: currentSave.source,
                    err: toError(error),
                  },
                  'Failed to persist agent state'
                )
              }
            }
          } finally {
            agentStateSaveInFlight = null
          }
        })()
      }

      return agentStateSaveInFlight
    }

    const flush = async () => {
      while (agentStateSaveInFlight || pendingAgentState) {
        if (!agentStateSaveInFlight && pendingAgentState) {
          queue(pendingAgentState.message, pendingAgentState.source)
        }

        if (agentStateSaveInFlight) {
          await agentStateSaveInFlight
        }
      }
    }

    return { queue, flush }
  }

  private subscribeToAgentEvents(params: {
    agent: CanvasAgent
    eventStream: AgentEventStream
    channel: string
    saver: AgentStateSaver
    invocationId: string
    logger: StartAgentLogger
  }): AgentEventSubscription {
    const STREAMING_EVENT_TYPES = new Set([
      'chat_streaming',
      'thinking_streaming',
      'progress_streaming',
      'tool_streaming',
      'report_output_streaming',
    ])

    let taskStatusUpdateQueue: Promise<void> = Promise.resolve()

    const enqueueTaskStatusUpdate = (eventType: string) => {
      taskStatusUpdateQueue = taskStatusUpdateQueue
        .catch(() => undefined)
        .then(async () => {
          await this.updateTaskFromAgentEvent(
            {
              invocationId: params.invocationId,
              eventType,
            },
            params.logger
          )
        })
    }

    params.eventStream.on('agent_event', (agentEvent) => {
      if (STREAMING_EVENT_TYPES.has(agentEvent.type)) {
        this.socketio.to(params.channel).emit(SocketServerEvents.AGENT_STREAMING, agentEvent)
      } else {
        const message: AgentSocketMessage = {
          event: agentEvent,
          state: params.agent.getState().toJSON(),
        }

        this.socketio.to(params.channel).emit(SocketServerEvents.AGENT_MESSAGE, message)
        void params.saver.queue(message, 'event')
        enqueueTaskStatusUpdate(agentEvent.type)
      }
    })

    return {
      flushTaskStatusUpdates: async () => {
        await taskStatusUpdateQueue.catch(() => undefined)
      },
      dispose: () => {
        setTimeout(() => {
          params.eventStream.removeAllListeners('agent_event')
        }, 1000) // Keep the event stream alive for 1 second to allow for late commands
      },
    }
  }

  private async persistFinalAgentState(agent: CanvasAgent, saver: AgentStateSaver) {
    const lastEvent = agent.getState().getLastAgentEvent()

    if (!lastEvent) {
      return
    }

    const finalMessage: AgentSocketMessage = {
      event: lastEvent,
      state: agent.getState().toJSON(),
    }

    await saver.queue(finalMessage, 'final')
  }

  private dispatchInvocationCompletedInBackground(
    payload: {
      invocationId: string
      workspaceId: string
      organizationId: string
      userId: string
      blocked: boolean
    },
    context: AgentInvoked['context'],
    logger: StartAgentLogger
  ) {
    try {
      void InvocationCompleted.dispatch(payload, context).catch((error) => {
        logger.error(
          {
            invocationId: payload.invocationId,
            err: toError(error),
          },
          'Failed to dispatch invocation completion event'
        )
      })
    } catch (error) {
      logger.error(
        {
          invocationId: payload.invocationId,
          err: toError(error),
        },
        'Failed to dispatch invocation completion event'
      )
    }
  }

  async handle(event: AgentInvoked) {
    const logger = ContextualLogger.createFallback({
      component: 'StartAgent',
      workspaceId: event.context.workspaceId,
      userId: event.context.userId,
      correlationId: event.context.correlationId,
    })

    logger.info({ invocationId: event.invocation.id }, 'StartAgent.handle() called - event received')

    return withSentryContext(
      {
        correlationId: event.context.correlationId,
        userId: event.context.userId,
        workspaceId: event.context.workspaceId,
        component: 'StartAgent',
        operation: 'agent_execution',
      },
      async () => this.executeAgent(event)
    )
  }

  private async executeAgent(event: AgentInvoked) {
    const logger = ContextualLogger.createFallback({
      component: 'StartAgent',
      workspaceId: event.invocation.workspaceId,
      userId: event.invocation.userId,
      correlationId: event.context.correlationId,
    })

    logger.info({ invocationId: event.invocation.id }, 'executeAgent() starting')

    const invocation = event.invocation
    const invocationId = invocation.id
    const ownerId = this.agentRuntimeService.ownerId
    const resumeFromAnsweredQuestion = invocation.agentState?.event?.type === 'ask_question_answered'

    // Resolve a fresh agent instance per invocation to avoid shared state
    // and to allow test overrides via the IoC container.
    const agent = await app.container.make(CanvasAgent)

    // Apply per-user LLM overrides from user config before execution starts.
    await this.applyUserLlmOverrides(agent, invocation.userId, logger)

    const cleanupRedis = await this.subscribeToInvocationCommands(invocation, agent, logger)
    let saver: AgentStateSaver | null = null
    let agentEventSubscription: AgentEventSubscription | null = null
    let executionError: unknown = null
    let organizationId: string | null = event.context.organizationId ?? null
    let preparedExecution: Awaited<ReturnType<StartAgent['buildPreparedAgentExecution']>> | null = null
    let heartbeat: NodeJS.Timeout | null = null
    let leaseAcquired = false
    let shouldDispatchInvocationCompleted = false

    const applyPendingCancel = async () => {
      const cancelRequest = await this.agentRuntimeService.getCancelRequest(invocationId)
      if (!cancelRequest) {
        return false
      }

      agent.getState().abort(cancelRequest.reason)
      return true
    }

    const startHeartbeat = () => {
      heartbeat = setInterval(() => {
        void (async () => {
          const refreshed = await this.agentRuntimeService.refreshLease(invocationId, ownerId)
          if (!refreshed) {
            logger.warn({ invocationId, ownerId }, 'Agent runtime lease lost; aborting execution')
            agent.getState().abort('Agent runtime lease lost')
            return
          }

          await applyPendingCancel()
        })().catch((error) => {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to refresh agent runtime lease'
          )
        })
      }, AgentRuntimeService.HEARTBEAT_INTERVAL_MS)

      heartbeat.unref()
    }

    try {
      leaseAcquired = await this.agentRuntimeService.acquireLease(invocationId, ownerId)
      if (!leaseAcquired) {
        logger.warn({ invocationId, ownerId }, 'Skipping agent execution because runtime lease was not acquired')
        return
      }
      shouldDispatchInvocationCompleted = true
      startHeartbeat()
      await applyPendingCancel()

      if (resumeFromAnsweredQuestion) {
        await this.hydrateFromInvocationState(invocation, agent, logger)
      } else {
        await this.hydrateFromParentInvocationIfAny(invocation, agent, logger)
      }

      preparedExecution = await this.buildPreparedAgentExecution(invocation, event.context, logger)
      const context = preparedExecution.context
      organizationId = context.organizationId
      const resolvedFlow = await agent.resolveFlow(context)
      await applyPendingCancel()
      const eventStream = agent.getEventStream()
      const channel = SocketChannels.agentEvents(invocation.id)
      const invocationSaver = this.createInvocationStateSaver(invocation, invocationId, ownerId, logger)
      saver = invocationSaver
      agentEventSubscription = this.subscribeToAgentEvents({
        agent,
        eventStream,
        channel,
        saver: invocationSaver,
        invocationId,
        logger,
      })

      try {
        await this.taskLifecycleService.markInvocationProcessing(invocationId)
      } catch (error) {
        logger.error(
          {
            invocationId,
            err: toError(error),
          },
          'Failed to mark task as processing'
        )
      }

      // Execute the agent
      logger.info({ query: invocation.query.slice(0, 100) }, 'Starting agent.execute()')
      const result = await agent.execute(invocation.query, context, resolvedFlow, undefined, {
        resumeFromState: resumeFromAnsweredQuestion,
      })
      logger.info('agent.execute() completed')

      const isWaitingForQuestion =
        result?.toolResults.some((toolResult) => toolResult.toolName === 'ask_question') ||
        agent.getState().getLastAgentEvent()?.type === 'ask_question_created'

      if (isWaitingForQuestion) {
        shouldDispatchInvocationCompleted = false
      }

      // Save final state after execution completes
      await this.persistFinalAgentState(agent, invocationSaver)
    } catch (error) {
      executionError = error
      throw error
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat)
      }

      if (saver) {
        try {
          await saver.flush()
        } catch (error) {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to flush pending agent state saves'
          )
        }
      }

      if (agentEventSubscription) {
        try {
          await agentEventSubscription.flushTaskStatusUpdates()
        } catch (error) {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to flush pending task status updates'
          )
        }
      }

      if (executionError) {
        try {
          await this.agentRuntimeService.persistExecutionErrorIfMissing(invocationId, ownerId, executionError)
        } catch (error) {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to persist fallback execution error state'
          )
        }
      }

      await this.updateTaskAfterExecution(
        {
          invocationId,
          lastEventType: invocation.agentState?.event?.type ?? agent.getState().getLastAgentEvent()?.type,
          executionError,
        },
        logger
      )

      if (leaseAcquired) {
        try {
          await this.agentRuntimeService.releaseLease(invocationId, ownerId)
        } catch (error) {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to release agent runtime lease'
          )
        }
      }

      if (preparedExecution) {
        try {
          await preparedExecution.cleanup()
        } catch (error) {
          logger.error(
            {
              invocationId,
              err: toError(error),
            },
            'Failed to cleanup invocation sandbox'
          )
        }
      }

      try {
        await cleanupRedis()
      } catch (error) {
        logger.error(
          {
            invocationId,
            err: toError(error),
          },
          'Failed to unsubscribe invocation command channel'
        )
      }

      try {
        agentEventSubscription?.dispose()
      } catch (error) {
        logger.error(
          {
            invocationId,
            err: toError(error),
          },
          'Failed to dispose agent event subscriptions'
        )
      }

      const wasRecovered = await this.agentRuntimeService.isRecovered(invocationId)

      if (shouldDispatchInvocationCompleted && organizationId && !wasRecovered) {
        this.dispatchInvocationCompletedInBackground(
          {
            invocationId,
            workspaceId: invocation.workspaceId,
            organizationId,
            userId: invocation.userId,
            blocked: false,
          },
          event.context,
          logger
        )
      }
    }
  }
}
