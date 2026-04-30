import type { OrganizationRole } from '#models/organization_membership'
import { ContextualLogger } from '#services/contextual_logger'
import { toError } from '#services/error_utils'
import type { DateTime } from 'luxon'
import { withTracing } from '@posthog/ai'
import { PostHog } from 'posthog-node'

const POSTHOG_API_KEY = 'phc_nPua9KjeiCtwcqqvORTARNUP00eL95e3afhOkxmz7gc'
const POSTHOG_HOST = 'https://eu.i.posthog.com'

type Timestamp = DateTime | null | undefined

export interface WorkspaceViewedTrackingPayload {
  correlationId: string
  user: {
    id: string
    email: string
    name: string
    createdAt: Timestamp
    updatedAt: Timestamp
  }
  workspace: {
    id: string
    name: string
    createdAt: Timestamp
    updatedAt: Timestamp
  }
  organization: {
    id: string
    name: string
    createdAt: Timestamp
    updatedAt: Timestamp
  }
  organizationRole: OrganizationRole
}

export interface IdentifyUserPayload {
  id: string
  email?: string | null
  name?: string | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface AiEventIdentity {
  distinctId: string
  workspaceId: string
  organizationId: string
  invocationId: string
  correlationId: string
}

export interface AiEventLinkage {
  traceId: string
  sessionId: string
  parentId?: string
}

export interface AiModelTracingOptions extends AiEventIdentity, AiEventLinkage {
  properties?: Record<string, unknown>
  privacyMode?: boolean
}

export interface AiTraceEventPayload extends AiEventIdentity {
  traceId: string
  sessionId: string
  traceName: string
  status: 'started' | 'completed' | 'failed' | 'cancelled'
  input?: unknown
  output?: unknown
  isError?: boolean
  error?: string
  properties?: Record<string, unknown>
}

export interface AiSpanEventPayload extends AiEventIdentity, AiEventLinkage {
  spanId: string
  spanName: string
  status: 'started' | 'completed' | 'failed' | 'cancelled'
  input?: unknown
  output?: unknown
  isError?: boolean
  error?: string
  properties?: Record<string, unknown>
}

export interface AiGenerationEventPayload extends AiEventIdentity, AiEventLinkage {
  model: string
  provider: string
  generationId?: string
  input?: unknown
  output?: unknown
  latencySeconds?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  isError?: boolean
  error?: string
  properties?: Record<string, unknown>
}

function toIso(value: Timestamp): string | undefined {
  if (!value) {
    return undefined
  }

  return value.toISO() ?? undefined
}

function compactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null))
}

export default class PostHogService {
  private readonly client: PostHog
  private readonly logger = ContextualLogger.createFallback({ component: 'PostHogService' })

  constructor() {
    this.client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    })

    this.client.on('error', (error) => {
      this.logger.warn({ operation: 'posthog_client_error', err: toError(error) }, 'PostHog client error')
    })
  }

  identifyUser(
    payload: IdentifyUserPayload,
    options: {
      set?: Record<string, unknown>
      setOnce?: Record<string, unknown>
    } = {}
  ): void {
    const nowIso = new Date().toISOString()
    const setProperties = compactProperties({
      email: payload.email,
      name: payload.name,
      user_id: payload.id,
      user_email: payload.email,
      user_name: payload.name,
      user_created_at: toIso(payload.createdAt),
      user_updated_at: toIso(payload.updatedAt),
      last_seen_at: nowIso,
      ...options.set,
    })
    const setOnceProperties = compactProperties({
      first_seen_at: nowIso,
      ...options.setOnce,
    })

    try {
      this.client.identify({
        distinctId: payload.id,
        properties: {
          $set: setProperties,
          ...(Object.keys(setOnceProperties).length > 0 ? { $set_once: setOnceProperties } : {}),
        },
      })
    } catch (error) {
      this.logger.warn(
        {
          operation: 'posthog_identify_user_failed',
          distinctId: payload.id,
          err: toError(error),
        },
        'Failed to identify PostHog user'
      )
    }
  }

  trackWorkspaceViewed(payload: WorkspaceViewedTrackingPayload): void {
    const nowIso = new Date().toISOString()

    this.identifyUser(
      {
        id: payload.user.id,
        email: payload.user.email,
        name: payload.user.name,
        createdAt: payload.user.createdAt,
        updatedAt: payload.user.updatedAt,
      },
      {
        set: {
          workspace_id: payload.workspace.id,
          workspace_name: payload.workspace.name,
          workspace_created_at: toIso(payload.workspace.createdAt),
          workspace_updated_at: toIso(payload.workspace.updatedAt),
          organization_id: payload.organization.id,
          organization_name: payload.organization.name,
          organization_created_at: toIso(payload.organization.createdAt),
          organization_updated_at: toIso(payload.organization.updatedAt),
          organization_role: payload.organizationRole,
          workspace_last_viewed_at: nowIso,
        },
      }
    )

    this.client.groupIdentify({
      groupType: 'workspace',
      groupKey: payload.workspace.id,
      distinctId: payload.user.id,
      properties: compactProperties({
        workspace_id: payload.workspace.id,
        name: payload.workspace.name,
        workspace_name: payload.workspace.name,
        workspace_created_at: toIso(payload.workspace.createdAt),
        workspace_updated_at: toIso(payload.workspace.updatedAt),
        workspace_last_viewed_at: nowIso,
        organization_id: payload.organization.id,
        organization_name: payload.organization.name,
      }),
    })

    this.client.groupIdentify({
      groupType: 'organization',
      groupKey: payload.organization.id,
      distinctId: payload.user.id,
      properties: compactProperties({
        organization_id: payload.organization.id,
        name: payload.organization.name,
        organization_name: payload.organization.name,
        organization_created_at: toIso(payload.organization.createdAt),
        organization_updated_at: toIso(payload.organization.updatedAt),
        organization_last_viewed_at: nowIso,
        last_viewed_workspace_id: payload.workspace.id,
        last_viewed_workspace_name: payload.workspace.name,
      }),
    })

    this.client.capture({
      distinctId: payload.user.id,
      event: 'workspace viewed',
      groups: {
        workspace: payload.workspace.id,
        organization: payload.organization.id,
      },
      properties: {
        endpoint: 'GET /workspaces/:id',
        route_name: 'workspaces.show',
        correlation_id: payload.correlationId,
        user_id: payload.user.id,
        user_name: payload.user.name,
        organization_id: payload.organization.id,
        organization_name: payload.organization.name,
        organization_role: payload.organizationRole,
        workspace_id: payload.workspace.id,
        workspace_name: payload.workspace.name,
      },
    })
  }

  wrapModelWithTracing<TModel>(model: TModel, options: AiModelTracingOptions): TModel {
    return withTracing(model as any, this.client, {
      posthogDistinctId: options.distinctId,
      posthogTraceId: options.traceId,
      posthogGroups: {
        workspace: options.workspaceId,
        organization: options.organizationId,
      },
      posthogProperties: compactProperties({
        ...this.getDefaultAiProperties(options),
        $ai_session_id: options.sessionId,
        $ai_parent_id: options.parentId,
        ...options.properties,
      }),
      posthogPrivacyMode: options.privacyMode ?? false,
    }) as TModel
  }

  captureAiTrace(payload: AiTraceEventPayload): void {
    this.captureAiEvent(payload, '$ai_trace', {
      $ai_trace_id: payload.traceId,
      $ai_session_id: payload.sessionId,
      $ai_span_name: payload.traceName,
      $ai_trace_name: payload.traceName,
      $ai_is_error: payload.isError,
      $ai_error: payload.error,
      $ai_input_state: payload.input,
      $ai_output_state: payload.output,
      $ai_input: payload.input,
      $ai_output: payload.output,
      status: payload.status,
      ...payload.properties,
    })
  }

  captureAiSpan(payload: AiSpanEventPayload): void {
    this.captureAiEvent(payload, '$ai_span', {
      $ai_trace_id: payload.traceId,
      $ai_session_id: payload.sessionId,
      $ai_span_id: payload.spanId,
      $ai_parent_id: payload.parentId,
      $ai_span_name: payload.spanName,
      $ai_is_error: payload.isError,
      $ai_error: payload.error,
      $ai_input_state: payload.input,
      $ai_output_state: payload.output,
      $ai_input: payload.input,
      $ai_output: payload.output,
      status: payload.status,
      ...payload.properties,
    })
  }

  captureAiGeneration(payload: AiGenerationEventPayload): void {
    this.captureAiEvent(payload, '$ai_generation', {
      $ai_trace_id: payload.traceId,
      $ai_session_id: payload.sessionId,
      $ai_parent_id: payload.parentId,
      $ai_generation_id: payload.generationId,
      $ai_span_id: payload.generationId,
      $ai_model: payload.model,
      $ai_provider: payload.provider,
      $ai_input: payload.input,
      $ai_output_choices: payload.output,
      $ai_output: payload.output,
      $ai_latency: payload.latencySeconds,
      $ai_input_tokens: payload.inputTokens,
      $ai_output_tokens: payload.outputTokens,
      $ai_total_tokens: payload.totalTokens,
      $ai_total_cost_usd: payload.costUsd,
      $ai_is_error: payload.isError,
      $ai_error: payload.error,
      ...payload.properties,
    })
  }

  private captureAiEvent(
    identity: AiEventIdentity,
    event: '$ai_trace' | '$ai_span' | '$ai_generation',
    properties: Record<string, unknown>
  ): void {
    try {
      this.client.capture({
        distinctId: identity.distinctId,
        event,
        groups: {
          workspace: identity.workspaceId,
          organization: identity.organizationId,
        },
        properties: compactProperties({
          ...this.getDefaultAiProperties(identity),
          ...properties,
        }),
      })
    } catch (error) {
      this.logger.warn(
        {
          operation: 'posthog_capture_ai_event_failed',
          event,
          invocationId: identity.invocationId,
          traceId: (properties.$ai_trace_id as string | undefined) ?? undefined,
          err: toError(error),
        },
        'Failed to capture PostHog AI event'
      )
    }
  }

  private getDefaultAiProperties(identity: AiEventIdentity): Record<string, unknown> {
    return {
      user_id: identity.distinctId,
      workspace_id: identity.workspaceId,
      organization_id: identity.organizationId,
      invocation_id: identity.invocationId,
      correlation_id: identity.correlationId,
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown()
    } catch (error) {
      this.logger.warn(
        { operation: 'posthog_shutdown_failed', err: toError(error) },
        'Failed to shutdown PostHog client'
      )
    }
  }
}
