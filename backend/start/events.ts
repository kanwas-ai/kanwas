import AgentInvoked from '#events/agent_invoked'
import InvocationSubscribed from '#events/invocation_subscribed'
import InvocationCompleted from '#events/invocation_completed'
import WorkspaceViewed from '#events/workspace_viewed'
import ConnectionsCatalogRefreshRequested from '#events/connections_catalog_refresh_requested'
import UserRegistered from '#events/user_registered'
import { captureException } from '#services/sentry_context'
import { toError } from '#services/error_utils'
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'

function getEventName(event: string | number | symbol | (new (...args: any[]) => object)): string {
  if (typeof event === 'string' || typeof event === 'number') {
    return String(event)
  }

  if (typeof event === 'symbol') {
    return event.description ?? event.toString()
  }

  return event.name
}

function extractEventContext(data: unknown): { correlationId?: string; userId?: string; workspaceId?: string } {
  if (!data || typeof data !== 'object') {
    return {}
  }

  const eventData = data as {
    context?: { correlationId?: string; userId?: string; workspaceId?: string }
    payload?: { userId?: string; workspaceId?: string }
    invocation?: { userId?: string; workspaceId?: string }
    workspace?: { id?: string }
    user?: { id?: string }
  }

  return {
    correlationId: eventData.context?.correlationId,
    userId:
      eventData.context?.userId ?? eventData.payload?.userId ?? eventData.invocation?.userId ?? eventData.user?.id,
    workspaceId:
      eventData.context?.workspaceId ??
      eventData.payload?.workspaceId ??
      eventData.invocation?.workspaceId ??
      eventData.workspace?.id,
  }
}

emitter.onError((event, error, eventData) => {
  const err = toError(error)
  const eventName = getEventName(event)
  const context = extractEventContext(eventData)

  logger.error(
    {
      component: 'EventEmitter',
      event: eventName,
      correlationId: context.correlationId,
      userId: context.userId,
      workspaceId: context.workspaceId,
      err,
    },
    'Unhandled event listener error'
  )

  void captureException(err, {
    tags: {
      component: 'EventEmitter',
      event: eventName,
    },
    extra: {
      correlationId: context.correlationId,
      userId: context.userId,
      workspaceId: context.workspaceId,
    },
  })
})

emitter.listen(AgentInvoked, [() => import('#listeners/start_agent')])
emitter.listen(InvocationSubscribed, [() => import('#listeners/send_initial_agent_state')])
emitter.listen(InvocationCompleted, [
  () => import('#listeners/sync_task_modified_folders'),
  () => import('#listeners/complete_workspace_onboarding'),
  () => import('#listeners/track_invocation_usage'),
])
emitter.listen(WorkspaceViewed, [() => import('#listeners/track_workspace_viewed')])
emitter.listen(ConnectionsCatalogRefreshRequested, [() => import('#listeners/refresh_connections_catalog')])
emitter.listen(UserRegistered, [() => import('#listeners/send_user_registration_slack_notification')])
