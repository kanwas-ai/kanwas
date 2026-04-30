import { Composio } from '@composio/core'
import { inject } from '@adonisjs/core'
import env from '#start/env'
import { ContextualLogger } from '#services/contextual_logger'
import { validateConnectionCallbackUrl } from './composio/callback_url_policy.js'
import {
  cleanupCustomAuthConfigIfKanwasManaged,
  deleteCustomAuthConfig,
  getCustomAuthRequirements,
  resolveOrCreateCustomAuthConfig,
} from './composio/custom_auth.js'
import {
  getConnectedAccountAuthConfig,
  isConnectedAccountOwnedByIdentity,
  listActiveConnectedAccountsByToolkit,
} from './composio/connected_accounts.js'
import {
  mergeCatalogWithWorkspaceConnections,
  mergeStatusesWithActiveConnectedAccounts,
  shouldExcludeConnection,
  toCatalogConnectionStatus,
} from './composio/connection_merge.js'
import { CONNECTED_ACCOUNT_STATUSES, GLOBAL_TOOLKIT_CATALOG_IDENTITY } from './composio/constants.js'
import { isComposioMissingManagedAuthError } from './composio/error_classifier.js'
import { buildComposioUserIdentity } from './composio/identity.js'
import { normalizeToolkit } from './composio/normalization.js'
import {
  createSessionForIdentity,
  listToolkitCatalogMetadata,
  listToolkitsForSession,
  mapConnectionRequest,
  mergeToolkitMetadata,
} from './composio/toolkit_catalog.js'
import {
  ConnectionNotInWorkspaceError,
  SlackInvalidPermalinkError,
  SlackMessageNotFoundError,
  SlackNotConnectedError,
  ToolkitRequiredError,
  ToolkitRequiresCustomAuthConfigError,
} from './composio/errors.js'
import type {
  ConnectionRequest,
  ConnectionStatus,
  InitiateConnectionParams,
  InitiateConnectionResult,
  ListToolkitsFilters,
} from './composio/types.js'

export type {
  ConnectionCategory,
  ConnectionStatus,
  CustomAuthField,
  CustomAuthFieldControl,
  CustomAuthFieldUiHints,
  CustomAuthFieldUiOption,
  CustomAuthModeRequirements,
  InitiateConnectionParams,
  InitiateConnectionResult,
  ListToolkitsFilters,
  ToolkitCustomAuthRequirements,
} from './composio/types.js'

export {
  ConnectionNotInWorkspaceError,
  InvalidConnectionCallbackUrlError,
  InvalidCustomAuthConfigError,
  SlackInvalidPermalinkError,
  SlackMessageNotFoundError,
  SlackNotConnectedError,
  ToolkitRequiredError,
  ToolkitRequiresCustomAuthConfigError,
} from './composio/errors.js'
import cache from '@adonisjs/cache/services/main'

interface SlackUserInfo {
  name: string
  avatar: string
}

// Slack display name + avatar change rarely; 7d keeps Composio API calls low while
// staying recent enough for identity updates to propagate. Cache lives in Redis
// (L2) via `@adonisjs/cache`, matching the pattern of ConnectionsCatalogCacheService.
const SLACK_USER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function slackUserCacheKey(workspaceId: string, slackUserId: string): string {
  return `composio:slack:user:v1:${workspaceId}:${slackUserId}`
}

@inject()
export default class ComposioService {
  private composio: Composio
  private readonly logger = ContextualLogger.createFallback({ component: 'ComposioService' })

  constructor() {
    this.composio = new Composio({
      apiKey: env.get('COMPOSIO_API_KEY'),
    })
  }

  private async createSession(userId: string, workspaceId: string) {
    const userIdentity = buildComposioUserIdentity(userId, workspaceId)
    return createSessionForIdentity(this.composio, userIdentity)
  }

  private async linkWithAuthConfig(
    userIdentity: string,
    authConfigId: string,
    callbackUrl: string
  ): Promise<InitiateConnectionResult> {
    const connectionRequest = (await this.composio.connectedAccounts.link(userIdentity, authConfigId, {
      callbackUrl,
    })) as ConnectionRequest

    return mapConnectionRequest(connectionRequest)
  }

  private async listWorkspaceToolkits(
    userId: string,
    workspaceId: string,
    filters: ListToolkitsFilters = {}
  ): Promise<ConnectionStatus[]> {
    const userIdentity = buildComposioUserIdentity(userId, workspaceId)
    const session = await createSessionForIdentity(this.composio, userIdentity)

    const [sessionStatuses, activeConnectionsByToolkit] = await Promise.all([
      listToolkitsForSession(session, filters, shouldExcludeConnection),
      listActiveConnectedAccountsByToolkit(this.composio, this.logger, userIdentity),
    ])

    if (!activeConnectionsByToolkit) {
      return sessionStatuses
    }

    return mergeStatusesWithActiveConnectedAccounts(sessionStatuses, activeConnectionsByToolkit, filters)
  }

  async listConnections(userId: string, workspaceId: string): Promise<ConnectionStatus[]> {
    return this.listWorkspaceToolkits(userId, workspaceId)
  }

  async listGlobalToolkitCatalog(): Promise<ConnectionStatus[]> {
    const session = await createSessionForIdentity(this.composio, GLOBAL_TOOLKIT_CATALOG_IDENTITY)
    const [catalogEntries, metadataByToolkit] = await Promise.all([
      listToolkitsForSession(session, {}, shouldExcludeConnection),
      listToolkitCatalogMetadata(this.composio),
    ])

    return catalogEntries.map((entry) => {
      const metadata = metadataByToolkit.get(entry.toolkit)
      return toCatalogConnectionStatus(mergeToolkitMetadata(entry, metadata))
    })
  }

  async listWorkspaceConnectedToolkits(userId: string, workspaceId: string): Promise<ConnectionStatus[]> {
    const statuses = await this.listWorkspaceToolkits(userId, workspaceId, { isConnected: true })
    return statuses.filter((status) => status.isConnected)
  }

  async getCustomAuthRequirements(toolkit: string) {
    return getCustomAuthRequirements(this.composio, toolkit)
  }

  mergeCatalogWithWorkspaceConnections(
    catalogEntries: ConnectionStatus[],
    workspaceEntries: ConnectionStatus[]
  ): ConnectionStatus[] {
    return mergeCatalogWithWorkspaceConnections(catalogEntries, workspaceEntries)
  }

  async initiateConnection(
    userId: string,
    workspaceId: string,
    params: InitiateConnectionParams
  ): Promise<InitiateConnectionResult> {
    const userIdentity = buildComposioUserIdentity(userId, workspaceId)
    const callbackUrl = validateConnectionCallbackUrl(params.callbackUrl.trim())
    const toolkit = normalizeToolkit(params.toolkit)
    const customAuth = params.customAuth

    if (!toolkit) {
      throw new ToolkitRequiredError()
    }

    if (customAuth) {
      const customAuthConfigId = await resolveOrCreateCustomAuthConfig(this.composio, toolkit, customAuth)

      try {
        return await this.linkWithAuthConfig(userIdentity, customAuthConfigId, callbackUrl)
      } catch (error) {
        await deleteCustomAuthConfig(this.composio, this.logger, customAuthConfigId)
        throw error
      }
    }

    const session = await this.createSession(userId, workspaceId)

    try {
      const connectionRequest = (await session.authorize(toolkit, {
        callbackUrl,
      })) as ConnectionRequest

      return mapConnectionRequest(connectionRequest)
    } catch (error) {
      if (isComposioMissingManagedAuthError(error)) {
        throw new ToolkitRequiresCustomAuthConfigError(toolkit)
      }

      throw error
    }
  }

  async listToolkits(
    userId: string,
    workspaceId: string,
    filters: ListToolkitsFilters = {}
  ): Promise<ConnectionStatus[]> {
    const normalizedSearch = filters.search?.trim()
    const normalizedFilters: ListToolkitsFilters = {
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
      ...(filters.isConnected !== undefined ? { isConnected: filters.isConnected } : {}),
      ...(filters.toolkits
        ? {
            toolkits: filters.toolkits
              .map((toolkit) => toolkit.trim().toLowerCase())
              .filter((toolkit) => toolkit.length > 0),
          }
        : {}),
    }

    const statuses = await this.listWorkspaceToolkits(userId, workspaceId, normalizedFilters)

    if (filters.isConnected === undefined) {
      return statuses
    }

    return statuses.filter((status) => status.isConnected === filters.isConnected)
  }

  async disconnect(connectedAccountId: string): Promise<void> {
    await this.composio.connectedAccounts.delete(connectedAccountId)
  }

  /**
   * Fetch a Slack message by permalink using the user's connected Slack account.
   */
  async fetchSlackMessage(
    userId: string,
    workspaceId: string,
    permalink: string
  ): Promise<{
    userName: string
    userAvatar: string
    text: string
    timestamp: string
    permalink: string
    channel: string
    mentions: string
  }> {
    const parsed = this.parseSlackPermalink(permalink)
    if (!parsed) {
      throw new SlackInvalidPermalinkError()
    }

    const userIdentity = buildComposioUserIdentity(userId, workspaceId)

    // Find the user's active Slack connected account
    const activeConnections = await listActiveConnectedAccountsByToolkit(this.composio, this.logger, userIdentity)
    const slackAccount = activeConnections?.get('slack')
    if (!slackAccount) {
      throw new SlackNotConnectedError()
    }

    // Thread replies need a different endpoint — conversations.replies returns the
    // parent + replies, from which we pick the matching ts. Top-level messages use
    // conversations.history with latest=ts.
    const isThreadReply = parsed.threadTs && parsed.threadTs !== parsed.messageTs
    const toolSlug = isThreadReply
      ? 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION'
      : 'SLACK_FETCH_CONVERSATION_HISTORY'
    const toolArgs = isThreadReply
      ? // Slack caps `limit` to 15 server-side for non-Marketplace apps, so
        // pagination would otherwise be needed. Bracketing the time window to
        // the exact reply ts narrows the result to parent + target in one call.
        {
          channel: parsed.channelId,
          ts: parsed.threadTs,
          oldest: parsed.messageTs,
          latest: parsed.messageTs,
          inclusive: true,
          limit: 2,
        }
      : { channel: parsed.channelId, latest: parsed.messageTs, inclusive: true, limit: 1 }

    const messageResult = await this.composio.tools.execute(toolSlug, {
      userId: userIdentity,
      connectedAccountId: slackAccount.connectedAccountId,
      arguments: toolArgs,
      dangerouslySkipVersionCheck: true,
    })

    const messageData = typeof messageResult === 'string' ? JSON.parse(messageResult) : messageResult
    const messages = messageData?.data?.messages ?? messageData?.messages ?? []
    const message = isThreadReply ? messages.find((m: { ts?: string }) => m?.ts === parsed.messageTs) : messages[0]

    if (!message) {
      throw new SlackMessageNotFoundError()
    }

    // Collect all user IDs to resolve: message author + mentioned users in text
    const messageText = message.text || ''
    const mentionedUserIds = Array.from(
      (messageText as string).matchAll(/<@([UW][A-Z0-9]+)>/g),
      (m: RegExpMatchArray) => m[1]
    )
    const allUserIds = Array.from(new Set([message.user, ...mentionedUserIds].filter(Boolean))) as string[]

    // Check Redis cache first; only fetch uncached users from Composio.
    const userInfoMap = new Map<string, SlackUserInfo>()
    const cachedEntries = await Promise.all(
      allUserIds.map(async (uid) => {
        const raw = await cache.get({ key: slackUserCacheKey(workspaceId, uid) })
        const cachedUser = this.parseCachedSlackUser(raw)
        return cachedUser ? ([uid, cachedUser] as const) : null
      })
    )
    for (const entry of cachedEntries) {
      if (entry) userInfoMap.set(entry[0], entry[1])
    }
    const uidsToFetch = allUserIds.filter((uid) => !userInfoMap.has(uid))

    // Fetch uncached user info in parallel, then backfill the Redis cache.
    await Promise.all(
      uidsToFetch.map(async (uid) => {
        try {
          const userResult = await this.composio.tools.execute('SLACK_RETRIEVE_DETAILED_USER_INFORMATION', {
            userId: userIdentity,
            connectedAccountId: slackAccount.connectedAccountId,
            arguments: { user: uid },
            dangerouslySkipVersionCheck: true,
          })
          const userData = typeof userResult === 'string' ? JSON.parse(userResult) : userResult
          const user =
            userData?.data?.user ??
            userData?.user ??
            userData?.data?.response_data?.user ??
            userData?.response_data?.user
          const profile = user?.profile
          const name = profile?.display_name || profile?.real_name || user?.real_name || user?.name || uid
          const avatar = profile?.image_72 || profile?.image_48 || profile?.image_32 || ''
          const info: SlackUserInfo = { name, avatar }
          userInfoMap.set(uid, info)
          await cache.set({
            key: slackUserCacheKey(workspaceId, uid),
            value: info,
            ttl: SLACK_USER_CACHE_TTL_MS,
          })
        } catch (e) {
          this.logger.warn({ err: e, uid }, 'Failed to fetch Slack user info')
        }
      })
    )

    const authorInfo = message.user ? userInfoMap.get(message.user) : undefined
    const userName = authorInfo?.name || message.user || 'Unknown'
    const userAvatar = authorInfo?.avatar || ''

    // Build mentions map (only for mentioned users in the message text)
    const mentions: Record<string, string> = {}
    for (const uid of mentionedUserIds) {
      const info = userInfoMap.get(uid)
      if (info) mentions[uid] = info.name
    }

    return {
      userName,
      userAvatar,
      text: messageText,
      timestamp: message.ts ? new Date(Number.parseFloat(message.ts) * 1000).toISOString() : new Date().toISOString(),
      permalink,
      channel: parsed.channelId,
      mentions: JSON.stringify(mentions),
    }
  }

  private parseCachedSlackUser(raw: unknown): SlackUserInfo | null {
    const obj = typeof raw === 'string' ? this.safeJsonParse(raw) : typeof raw === 'object' && raw !== null ? raw : null
    if (!obj) return null
    const { name, avatar } = obj as Partial<SlackUserInfo>
    if (typeof name !== 'string' || typeof avatar !== 'string') return null
    return { name, avatar }
  }

  private safeJsonParse(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  private parseSlackPermalink(permalink: string): { channelId: string; messageTs: string; threadTs?: string } | null {
    try {
      const url = new URL(permalink)
      if (!url.hostname.endsWith('slack.com')) return null

      // Format: /archives/C12345/p1234567890123456
      const match = url.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/)
      if (!match) return null

      const channelId = match[1]
      const rawTs = match[2]
      // Insert dot before last 6 digits: 1234567890123456 → 1234567890.123456
      const messageTs = rawTs.slice(0, rawTs.length - 6) + '.' + rawTs.slice(rawTs.length - 6)

      // Thread replies carry ?thread_ts=<parent-ts> (already in Slack's dotted form)
      const threadTs = url.searchParams.get('thread_ts') || undefined

      return { channelId, messageTs, threadTs }
    } catch {
      return null
    }
  }

  async disconnectForWorkspace(userId: string, workspaceId: string, connectedAccountId: string): Promise<void> {
    const userIdentity = buildComposioUserIdentity(userId, workspaceId)
    const isOwnedByWorkspace = await isConnectedAccountOwnedByIdentity(
      this.composio,
      this.logger,
      userIdentity,
      connectedAccountId,
      CONNECTED_ACCOUNT_STATUSES
    )

    if (!isOwnedByWorkspace) {
      throw new ConnectionNotInWorkspaceError()
    }

    const authConfig = await getConnectedAccountAuthConfig(this.composio, connectedAccountId)

    await this.disconnect(connectedAccountId)
    await cleanupCustomAuthConfigIfKanwasManaged(this.composio, this.logger, authConfig)
  }
}
