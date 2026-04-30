import { EXCLUDED_CONNECTION_DISPLAY_NAME, EXCLUDED_CONNECTION_TAGS } from './constants.js'
import { normalizeConnectionFilterToken, normalizeToolkit } from './normalization.js'
import type { ActiveConnectedAccount, ConnectionStatus, ListToolkitsFilters } from './types.js'

export function shouldExcludeConnection(status: ConnectionStatus): boolean {
  const normalizedDisplayName = normalizeConnectionFilterToken(status.displayName)
  if (normalizedDisplayName !== EXCLUDED_CONNECTION_DISPLAY_NAME) {
    return false
  }

  const normalizedTags = new Set<string>()

  for (const category of status.categories ?? []) {
    const normalizedSlug = normalizeConnectionFilterToken(category.slug)
    const normalizedName = normalizeConnectionFilterToken(category.name)

    if (normalizedSlug) {
      normalizedTags.add(normalizedSlug)
    }

    if (normalizedName) {
      normalizedTags.add(normalizedName)
    }
  }

  return EXCLUDED_CONNECTION_TAGS.every((tag) => normalizedTags.has(tag))
}

function shouldIncludeMissingToolkit(toolkit: string, filters: ListToolkitsFilters): boolean {
  if (filters.isConnected === false) {
    return false
  }

  if (filters.toolkits && filters.toolkits.length > 0 && !filters.toolkits.includes(toolkit)) {
    return false
  }

  const normalizedSearch = normalizeConnectionFilterToken(filters.search)
  if (normalizedSearch && !toolkit.includes(normalizedSearch)) {
    return false
  }

  return true
}

export function mergeStatusesWithActiveConnectedAccounts(
  statuses: ConnectionStatus[],
  activeConnectionsByToolkit: Map<string, ActiveConnectedAccount>,
  filters: ListToolkitsFilters = {}
): ConnectionStatus[] {
  const normalizedStatuses = statuses.map((status) => {
    const toolkit = normalizeToolkit(status.toolkit) ?? status.toolkit
    const activeConnection = activeConnectionsByToolkit.get(toolkit)

    if (status.isNoAuth) {
      return {
        ...status,
        toolkit,
        isConnected: true,
      }
    }

    if (!activeConnection) {
      return {
        ...status,
        toolkit,
        isConnected: false,
        connectedAccountId: undefined,
        connectedAccountStatus: undefined,
      }
    }

    return {
      ...status,
      toolkit,
      isConnected: true,
      connectedAccountId: activeConnection.connectedAccountId,
      connectedAccountStatus: activeConnection.connectedAccountStatus,
      authConfigId: activeConnection.authConfigId ?? status.authConfigId,
      authMode: status.authMode ?? activeConnection.authMode,
      isComposioManaged: activeConnection.isComposioManaged ?? status.isComposioManaged,
    }
  })

  const existingToolkits = new Set(
    normalizedStatuses
      .map((status) => normalizeToolkit(status.toolkit))
      .filter((toolkit): toolkit is string => toolkit !== undefined)
  )

  const missingActiveStatuses: ConnectionStatus[] = []

  for (const [toolkit, activeConnection] of activeConnectionsByToolkit.entries()) {
    if (existingToolkits.has(toolkit) || !shouldIncludeMissingToolkit(toolkit, filters)) {
      continue
    }

    missingActiveStatuses.push({
      toolkit,
      displayName: toolkit,
      isConnected: true,
      connectedAccountId: activeConnection.connectedAccountId,
      connectedAccountStatus: activeConnection.connectedAccountStatus,
      authConfigId: activeConnection.authConfigId,
      authMode: activeConnection.authMode,
      isComposioManaged: activeConnection.isComposioManaged,
      isNoAuth: false,
    })
  }

  return [...normalizedStatuses, ...missingActiveStatuses].filter((status) => !shouldExcludeConnection(status))
}

export function toCatalogConnectionStatus(status: ConnectionStatus): ConnectionStatus {
  return {
    toolkit: status.toolkit,
    displayName: status.displayName,
    logo: status.logo,
    ...(status.description ? { description: status.description } : {}),
    ...(status.categories && status.categories.length > 0 ? { categories: status.categories } : {}),
    isConnected: status.isNoAuth,
    connectedAccountId: undefined,
    connectedAccountStatus: undefined,
    authConfigId: undefined,
    authMode: undefined,
    isComposioManaged: undefined,
    isNoAuth: status.isNoAuth,
  }
}

export function mergeCatalogWithWorkspaceConnections(
  catalogEntries: ConnectionStatus[],
  workspaceEntries: ConnectionStatus[]
): ConnectionStatus[] {
  const merged = catalogEntries.map((entry) => toCatalogConnectionStatus(entry))
  const indexByToolkit = new Map<string, number>()

  merged.forEach((entry, index) => {
    indexByToolkit.set(entry.toolkit, index)
  })

  for (const workspaceEntry of workspaceEntries) {
    const existingIndex = indexByToolkit.get(workspaceEntry.toolkit)

    if (existingIndex === undefined) {
      merged.push({
        toolkit: workspaceEntry.toolkit,
        displayName: workspaceEntry.displayName || workspaceEntry.toolkit,
        logo: workspaceEntry.logo,
        ...(workspaceEntry.description ? { description: workspaceEntry.description } : {}),
        ...(workspaceEntry.categories && workspaceEntry.categories.length > 0
          ? { categories: workspaceEntry.categories }
          : {}),
        isConnected: workspaceEntry.isConnected || workspaceEntry.isNoAuth,
        connectedAccountId: workspaceEntry.connectedAccountId,
        connectedAccountStatus: workspaceEntry.connectedAccountStatus,
        authConfigId: workspaceEntry.authConfigId,
        authMode: workspaceEntry.authMode,
        isComposioManaged: workspaceEntry.isComposioManaged,
        isNoAuth: workspaceEntry.isNoAuth,
      })
      indexByToolkit.set(workspaceEntry.toolkit, merged.length - 1)
      continue
    }

    const existingEntry = merged[existingIndex]
    const mergedDescription = workspaceEntry.description ?? existingEntry.description
    const mergedCategories = workspaceEntry.categories ?? existingEntry.categories

    merged[existingIndex] = {
      ...existingEntry,
      displayName: workspaceEntry.displayName || existingEntry.displayName,
      logo: workspaceEntry.logo ?? existingEntry.logo,
      ...(mergedDescription ? { description: mergedDescription } : {}),
      ...(mergedCategories && mergedCategories.length > 0 ? { categories: mergedCategories } : {}),
      isConnected: workspaceEntry.isConnected || workspaceEntry.isNoAuth || existingEntry.isNoAuth,
      connectedAccountId: workspaceEntry.connectedAccountId,
      connectedAccountStatus: workspaceEntry.connectedAccountStatus,
      authConfigId: workspaceEntry.authConfigId,
      authMode: workspaceEntry.authMode,
      isComposioManaged: workspaceEntry.isComposioManaged,
      isNoAuth: workspaceEntry.isNoAuth,
    }
  }

  return merged.filter((entry) => !shouldExcludeConnection(entry))
}
