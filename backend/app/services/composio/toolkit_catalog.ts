import type { Composio } from '@composio/core'
import { isRecord, normalizeCategories, normalizeCategory } from './normalization.js'
import type {
  ConnectionRequest,
  ConnectionStatus,
  InitiateConnectionResult,
  ListToolkitsFilters,
  ToolRouterSession,
  ToolkitCatalogMetadata,
  ToolkitConnectionState,
} from './types.js'

function isToolkitConnected(toolkitState: ToolkitConnectionState): boolean {
  if (toolkitState.isNoAuth) {
    return true
  }

  if (toolkitState.connection?.isActive === true) {
    return true
  }

  const connectedAccountStatus = toolkitState.connection?.connectedAccount?.status
  return typeof connectedAccountStatus === 'string' && connectedAccountStatus.trim().toUpperCase() === 'ACTIVE'
}

function mapToolkitConnection(toolkitState: ToolkitConnectionState): ConnectionStatus {
  const authConfig = toolkitState.connection?.authConfig
  const connectedAccount = toolkitState.connection?.connectedAccount
  const description = toolkitState.description?.trim()
  const categories =
    toolkitState.categories && toolkitState.categories.length > 0
      ? toolkitState.categories
          .map((category) => normalizeCategory(category))
          .filter((category): category is NonNullable<typeof category> => category !== undefined)
      : undefined

  return {
    toolkit: toolkitState.slug,
    displayName: toolkitState.name,
    logo: toolkitState.logo,
    ...(description ? { description } : {}),
    ...(categories && categories.length > 0 ? { categories } : {}),
    isConnected: isToolkitConnected(toolkitState),
    connectedAccountId: connectedAccount?.id,
    connectedAccountStatus: connectedAccount?.status,
    authConfigId: authConfig?.id,
    authMode: authConfig?.mode,
    isComposioManaged: authConfig?.isComposioManaged,
    isNoAuth: toolkitState.isNoAuth,
  }
}

function normalizeToolkitCatalogItems(rawResponse: unknown): Record<string, unknown>[] {
  if (Array.isArray(rawResponse)) {
    return rawResponse.filter((item): item is Record<string, unknown> => isRecord(item))
  }

  if (isRecord(rawResponse) && Array.isArray(rawResponse.items)) {
    return rawResponse.items.filter((item): item is Record<string, unknown> => isRecord(item))
  }

  return []
}

export async function listToolkitCatalogMetadata(composio: Composio): Promise<Map<string, ToolkitCatalogMetadata>> {
  const metadataByToolkit = new Map<string, ToolkitCatalogMetadata>()
  const toolkitApi = (
    composio as unknown as {
      toolkits?: {
        get?: (params?: { limit?: number }) => Promise<unknown>
      }
    }
  ).toolkits

  if (!toolkitApi?.get) {
    return metadataByToolkit
  }

  try {
    const rawResponse = await toolkitApi.get({ limit: 1000 })
    const items = normalizeToolkitCatalogItems(rawResponse)

    for (const item of items) {
      const slug = typeof item.slug === 'string' ? item.slug.trim().toLowerCase() : ''
      if (!slug) {
        continue
      }

      const meta = isRecord(item.meta) ? item.meta : {}
      const displayName = typeof item.name === 'string' ? item.name.trim() : ''
      const logo = typeof meta.logo === 'string' ? meta.logo.trim() : ''
      const description = typeof meta.description === 'string' ? meta.description.trim() : ''
      const categories = normalizeCategories(meta.categories)
      const isNoAuth = typeof item.noAuth === 'boolean' ? item.noAuth : undefined

      const metadata: ToolkitCatalogMetadata = {
        ...(displayName ? { displayName } : {}),
        ...(logo ? { logo } : {}),
        ...(description ? { description } : {}),
        ...(categories && categories.length > 0 ? { categories } : {}),
        ...(typeof isNoAuth === 'boolean' ? { isNoAuth } : {}),
      }

      if (Object.keys(metadata).length > 0) {
        metadataByToolkit.set(slug, metadata)
      }
    }
  } catch {
    return metadataByToolkit
  }

  return metadataByToolkit
}

export function mergeToolkitMetadata(status: ConnectionStatus, metadata?: ToolkitCatalogMetadata): ConnectionStatus {
  if (!metadata) {
    return status
  }

  const mergedIsNoAuth = status.isNoAuth || metadata.isNoAuth === true
  const mergedCategories = status.categories && status.categories.length > 0 ? status.categories : metadata.categories
  const mergedDescription = status.description ?? metadata.description
  const mergedLogo = status.logo ?? metadata.logo
  const mergedDisplayName = metadata.displayName ?? status.displayName

  return {
    ...status,
    displayName: mergedDisplayName,
    ...(mergedLogo ? { logo: mergedLogo } : {}),
    ...(mergedDescription ? { description: mergedDescription } : {}),
    ...(mergedCategories && mergedCategories.length > 0 ? { categories: mergedCategories } : {}),
    isConnected: status.isConnected || mergedIsNoAuth,
    isNoAuth: mergedIsNoAuth,
  }
}

export function mapConnectionRequest(connectionRequest: ConnectionRequest): InitiateConnectionResult {
  return {
    redirectUrl: connectionRequest.redirectUrl || '',
    connectedAccountId: connectionRequest.id || '',
  }
}

export function createSessionForIdentity(composio: Composio, userIdentity: string): Promise<ToolRouterSession> {
  return composio.create(userIdentity, {
    manageConnections: false,
  }) as Promise<ToolRouterSession>
}

export async function listToolkitsForSession(
  session: ToolRouterSession,
  filters: ListToolkitsFilters = {},
  shouldExcludeConnection?: (status: ConnectionStatus) => boolean
): Promise<ConnectionStatus[]> {
  const statuses: ConnectionStatus[] = []
  let nextCursor: string | undefined
  const seenCursors = new Set<string>()

  do {
    if (nextCursor && seenCursors.has(nextCursor)) {
      break
    }

    if (nextCursor) {
      seenCursors.add(nextCursor)
    }

    const page = await session.toolkits({
      limit: 50,
      nextCursor,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.isConnected !== undefined ? { isConnected: filters.isConnected } : {}),
      ...(filters.toolkits && filters.toolkits.length > 0 ? { toolkits: filters.toolkits } : {}),
    })

    for (const toolkitState of page.items) {
      statuses.push(mapToolkitConnection(toolkitState))
    }

    nextCursor = page.nextCursor
  } while (nextCursor)

  if (!shouldExcludeConnection) {
    return statuses
  }

  return statuses.filter((status) => !shouldExcludeConnection(status))
}
