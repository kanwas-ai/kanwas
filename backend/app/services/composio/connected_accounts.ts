import type { Composio } from '@composio/core'
import type { ContextualLoggerContract } from '#contracts/contextual_logger'
import { normalizeAuthConfigState } from './auth_config.js'
import { isComposioUnsupportedConnectedAccountStatusesError } from './error_classifier.js'
import { isRecord, normalizeConnectedAccountStatus, normalizeToolkit } from './normalization.js'
import type {
  ActiveConnectedAccount,
  AuthConfigState,
  ConnectedAccountState,
  ConnectedAccountsListOptions,
  ConnectedAccountsPage,
  ConnectedAccountStatus,
} from './types.js'

type WarnLogger = Pick<ContextualLoggerContract, 'warn'>

function getConnectedAccountToolkitSlug(account: ConnectedAccountState): string | undefined {
  const rawToolkit =
    typeof account.toolkit?.slug === 'string'
      ? account.toolkit.slug
      : typeof account.appName === 'string'
        ? account.appName
        : undefined

  return normalizeToolkit(rawToolkit)
}

function getConnectedAccountAuthMode(account: ConnectedAccountState): string | undefined {
  const rawMode =
    typeof account.state?.auth_scheme === 'string'
      ? account.state.auth_scheme
      : typeof account.state?.authScheme === 'string'
        ? account.state.authScheme
        : undefined

  if (!rawMode) {
    return undefined
  }

  const normalizedMode = rawMode.trim()
  return normalizedMode.length > 0 ? normalizedMode : undefined
}

export function buildActiveConnectedAccountsByToolkit(
  connectedAccounts: ConnectedAccountState[]
): Map<string, ActiveConnectedAccount> {
  const activeConnectionsByToolkit = new Map<string, ActiveConnectedAccount>()

  for (const account of connectedAccounts) {
    if (normalizeConnectedAccountStatus(account.status) !== 'ACTIVE') {
      continue
    }

    const toolkit = getConnectedAccountToolkitSlug(account)
    if (!toolkit || activeConnectionsByToolkit.has(toolkit)) {
      continue
    }

    activeConnectionsByToolkit.set(toolkit, {
      connectedAccountId: account.id,
      connectedAccountStatus: 'ACTIVE',
      authConfigId: account.authConfig?.id,
      authMode: getConnectedAccountAuthMode(account),
      isComposioManaged: account.authConfig?.isComposioManaged,
    })
  }

  return activeConnectionsByToolkit
}

async function listConnectedAccountsPageForIdentity(
  composio: Composio,
  userIdentity: string,
  cursor: string | undefined,
  statuses?: ConnectedAccountStatus[]
): Promise<ConnectedAccountsPage> {
  const options: ConnectedAccountsListOptions = {
    userIds: [userIdentity],
    cursor,
    limit: 200,
    ...(statuses && statuses.length > 0 ? { statuses } : {}),
  }

  return (await composio.connectedAccounts.list(options)) as ConnectedAccountsPage
}

export async function listConnectedAccountsForIdentity(
  composio: Composio,
  logger: WarnLogger,
  userIdentity: string,
  statuses?: ConnectedAccountStatus[]
): Promise<ConnectedAccountState[]> {
  let cursor: string | undefined
  const requestedStatuses = Array.isArray(statuses) && statuses.length > 0 ? statuses : undefined
  let useFilteredStatuses = requestedStatuses !== undefined
  const seenCursors = new Set<string>()
  const connectedAccounts: ConnectedAccountState[] = []

  do {
    if (cursor && seenCursors.has(cursor)) {
      break
    }

    if (cursor) {
      seenCursors.add(cursor)
    }

    let page: ConnectedAccountsPage
    try {
      page = await listConnectedAccountsPageForIdentity(
        composio,
        userIdentity,
        cursor,
        useFilteredStatuses ? requestedStatuses : undefined
      )
    } catch (error) {
      if (!useFilteredStatuses) {
        throw error
      }

      if (!isComposioUnsupportedConnectedAccountStatusesError(error)) {
        throw error
      }

      logger.warn(
        {
          operation: 'composio_connected_accounts_status_filter_not_supported',
          userIdentity,
          cursor,
          statuses: requestedStatuses,
          error,
        },
        'Connected accounts status filter is not supported; retrying without statuses'
      )

      useFilteredStatuses = false
      page = await listConnectedAccountsPageForIdentity(composio, userIdentity, cursor)
    }

    connectedAccounts.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return connectedAccounts
}

export async function listActiveConnectedAccountsByToolkit(
  composio: Composio,
  logger: WarnLogger,
  userIdentity: string
): Promise<Map<string, ActiveConnectedAccount> | null> {
  try {
    const connectedAccounts = await listConnectedAccountsForIdentity(composio, logger, userIdentity, ['ACTIVE'])
    return buildActiveConnectedAccountsByToolkit(connectedAccounts)
  } catch {
    return null
  }
}

export async function isConnectedAccountOwnedByIdentity(
  composio: Composio,
  logger: WarnLogger,
  userIdentity: string,
  connectedAccountId: string,
  statuses: ConnectedAccountStatus[]
): Promise<boolean> {
  const connectedAccounts = await listConnectedAccountsForIdentity(composio, logger, userIdentity, statuses)
  return connectedAccounts.some((item) => item.id === connectedAccountId)
}

export async function getConnectedAccountAuthConfig(
  composio: Composio,
  connectedAccountId: string
): Promise<AuthConfigState | undefined> {
  try {
    const connectedAccount = (await composio.connectedAccounts.get(connectedAccountId)) as unknown
    if (!isRecord(connectedAccount)) {
      return undefined
    }

    const authConfig = isRecord(connectedAccount.authConfig) ? connectedAccount.authConfig : undefined
    if (!authConfig) {
      return undefined
    }

    return normalizeAuthConfigState(authConfig)
  } catch {
    return undefined
  }
}
