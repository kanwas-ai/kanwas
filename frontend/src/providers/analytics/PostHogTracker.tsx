import { useEffect, useMemo, useRef } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { usePostHog } from '@posthog/react'
import { useOrganization } from '@/hooks/useOrganizations'
import { useWorkspace as useWorkspaceDetails } from '@/hooks/useWorkspaces'
import { isPostHogEnabled } from '@/lib/analytics/posthog'
import { useAuthState } from '@/providers/auth'
import { fromUrlUuid } from '@/utils/uuid'

const WORKSPACE_ROUTE_PATTERN = '/w/:workspaceId/*'
const WORKSPACE_ROOT_ROUTE_PATTERN = '/w/:workspaceId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DUPLICATE_ROUTE_WINDOW_MS = 1500

let lastWorkspaceRouteFingerprint: string | null = null
let lastWorkspaceRouteCapturedAt = 0

function getWorkspaceIdFromPathname(pathname: string): string | null {
  const workspaceMatch =
    matchPath(WORKSPACE_ROUTE_PATTERN, pathname) ?? matchPath(WORKSPACE_ROOT_ROUTE_PATTERN, pathname)
  const rawWorkspaceId = workspaceMatch?.params.workspaceId?.trim()

  if (!rawWorkspaceId) {
    return null
  }

  const normalizedWorkspaceId = fromUrlUuid(rawWorkspaceId).toLowerCase()
  if (!UUID_PATTERN.test(normalizedWorkspaceId)) {
    return null
  }

  return normalizedWorkspaceId
}

function shouldCaptureWorkspaceRoute(fingerprint: string): boolean {
  const now = Date.now()
  if (lastWorkspaceRouteFingerprint === fingerprint && now - lastWorkspaceRouteCapturedAt < DUPLICATE_ROUTE_WINDOW_MS) {
    return false
  }

  lastWorkspaceRouteFingerprint = fingerprint
  lastWorkspaceRouteCapturedAt = now
  return true
}

export function PostHogTracker() {
  const posthog = usePostHog()
  const location = useLocation()
  const { user, isAuthenticated, isLoading } = useAuthState()

  const workspaceId = useMemo(() => getWorkspaceIdFromPathname(location.pathname), [location.pathname])
  const trackedWorkspaceId = isPostHogEnabled && workspaceId ? workspaceId : undefined
  const { data: workspace } = useWorkspaceDetails(trackedWorkspaceId)
  const { data: organization } = useOrganization(trackedWorkspaceId)

  const wasAuthenticatedRef = useRef(false)
  const lastIdentifyKeyRef = useRef<string | null>(null)
  const lastWorkspaceGroupKeyRef = useRef<string | null>(null)
  const lastOrganizationGroupKeyRef = useRef<string | null>(null)
  const previousWorkspaceIdRef = useRef<string | null>(null)
  const lastTrackedWorkspaceRouteRef = useRef<string | null>(null)

  useEffect(() => {
    if (!workspaceId) {
      lastTrackedWorkspaceRouteRef.current = null
    }
  }, [workspaceId])

  useEffect(() => {
    if (!isPostHogEnabled || !posthog || isLoading) {
      return
    }

    if (!isAuthenticated) {
      if (wasAuthenticatedRef.current) {
        posthog.reset()
        lastIdentifyKeyRef.current = null
        lastWorkspaceGroupKeyRef.current = null
        lastOrganizationGroupKeyRef.current = null
        previousWorkspaceIdRef.current = null
        lastTrackedWorkspaceRouteRef.current = null
        lastWorkspaceRouteFingerprint = null
        lastWorkspaceRouteCapturedAt = 0
      }

      wasAuthenticatedRef.current = false
      return
    }

    wasAuthenticatedRef.current = true
  }, [isAuthenticated, isLoading, posthog])

  useEffect(() => {
    if (!isPostHogEnabled || !posthog || !isAuthenticated || !user?.id) {
      return
    }

    const identifyKey = `${user.id}|${user.email}|${user.name}`
    if (lastIdentifyKeyRef.current === identifyKey) {
      return
    }

    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
    })
    lastIdentifyKeyRef.current = identifyKey
  }, [isAuthenticated, posthog, user?.email, user?.id, user?.name])

  useEffect(() => {
    if (!isPostHogEnabled || !posthog || !isAuthenticated || !user?.id || !workspaceId) {
      return
    }

    const workspaceGroupKey = workspaceId
    if (lastWorkspaceGroupKeyRef.current === workspaceGroupKey) {
      return
    }

    posthog.group('workspace', workspaceId)
    lastWorkspaceGroupKeyRef.current = workspaceGroupKey
  }, [isAuthenticated, posthog, user?.id, workspaceId])

  useEffect(() => {
    if (!isPostHogEnabled || !posthog || !isAuthenticated || !user?.id || !organization?.id) {
      return
    }

    const organizationGroupKey = organization.id
    if (lastOrganizationGroupKeyRef.current === organizationGroupKey) {
      return
    }

    posthog.group('organization', organization.id)
    lastOrganizationGroupKeyRef.current = organizationGroupKey
  }, [isAuthenticated, organization?.id, posthog, user?.id])

  useEffect(() => {
    if (!isPostHogEnabled || !posthog || !isAuthenticated || !user?.id || !workspaceId) {
      return
    }

    const workspaceRouteFingerprint = `${workspaceId}|${location.pathname}|${location.search}|${location.hash}`
    if (lastTrackedWorkspaceRouteRef.current === workspaceRouteFingerprint) {
      return
    }

    if (!shouldCaptureWorkspaceRoute(workspaceRouteFingerprint)) {
      lastTrackedWorkspaceRouteRef.current = workspaceRouteFingerprint
      previousWorkspaceIdRef.current = workspaceId
      return
    }

    const groups = organization?.id
      ? { workspace: workspaceId, organization: organization.id }
      : { workspace: workspaceId }

    const workspaceOpenedProperties: Record<string, unknown> = {
      workspace_id: workspaceId,
      $groups: groups,
    }

    if (workspace?.name) {
      workspaceOpenedProperties.workspace_name = workspace.name
    }

    if (organization?.id) {
      workspaceOpenedProperties.organization_id = organization.id
    }

    if (organization?.name) {
      workspaceOpenedProperties.organization_name = organization.name
    }

    posthog.capture('workspace opened', workspaceOpenedProperties)

    const previousWorkspaceId = previousWorkspaceIdRef.current
    if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
      const workspaceSwitchedProperties: Record<string, unknown> = {
        from_workspace_id: previousWorkspaceId,
        to_workspace_id: workspaceId,
        $groups: groups,
      }

      if (workspace?.name) {
        workspaceSwitchedProperties.workspace_name = workspace.name
      }

      if (organization?.id) {
        workspaceSwitchedProperties.organization_id = organization.id
      }

      if (organization?.name) {
        workspaceSwitchedProperties.organization_name = organization.name
      }

      posthog.capture('workspace switched', workspaceSwitchedProperties)
    }

    lastTrackedWorkspaceRouteRef.current = workspaceRouteFingerprint
    previousWorkspaceIdRef.current = workspaceId
  }, [
    isAuthenticated,
    location.hash,
    location.pathname,
    location.search,
    organization?.id,
    organization?.name,
    posthog,
    user?.id,
    workspace?.name,
    workspaceId,
  ])

  return null
}
