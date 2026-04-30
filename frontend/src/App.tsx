import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { fromUrlUuid } from '@/utils/uuid'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostHogProvider } from '@posthog/react'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { OAuthCallback } from '@/pages/OAuthCallback'
import { ConnectionsCallback } from '@/pages/ConnectionsCallback'
import { InviteAcceptPage } from '@/pages/InviteAcceptPage'
import { CliAuthPage } from '@/pages/CliAuthPage'
import { ThemeProvider } from '@/providers/theme'
import { AuthProvider } from '@/providers/auth'
import { KeyboardProvider } from '@/providers/keyboard'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ToastContainer } from '@/components/ui/Toast'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { PostHogTracker } from '@/providers/analytics/PostHogTracker'
import { posthog } from '@/lib/analytics/posthog'
import { WorkspacePage } from './pages/WorkspacePage'
import { RootRedirect } from './pages/RootRedirect'
import {
  getLastOrganization,
  getLastWorkspace,
  getLastWorkspaceForOrganization,
  getOrganizationForWorkspace,
  rememberWorkspaceVisit,
} from '@/hooks/workspaceStorage'
import { EmbedBootstrap } from './pages/EmbedBootstrap'
import { PublicDocumentSharePage } from './pages/PublicDocumentSharePage'
import { toUrlUuid } from './utils/uuid'
import { resolveWorkspaceRedirect } from '@/lib/workspaceRedirect'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
      retry: 1,
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
})

function WorkspacePageWrapper() {
  const { workspaceId, '*': canvasPath } = useParams<{ 'workspaceId': string; '*': string }>()
  // Normalize UUID format: URL uses no-hyphens, but the collaboration room uses hyphenated format
  // to match backend/sandbox which uses database UUID format
  const normalizedId = workspaceId ? fromUrlUuid(workspaceId) : undefined
  const { data: workspaces, isLoading, isError } = useWorkspaces()
  const currentWorkspace = normalizedId ? workspaces?.find((workspace) => workspace.id === normalizedId) : undefined

  const hasMembership = !isLoading && !isError && workspaces && workspaces.some((w) => w.id === normalizedId)

  useEffect(() => {
    if (currentWorkspace) {
      rememberWorkspaceVisit(currentWorkspace.id, currentWorkspace.organizationId)
    }
  }, [currentWorkspace])

  if (!normalizedId) {
    return <Navigate to="/" replace />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="mb-4">Loading....</div>
          <p className="text-gray-600">Checking workspace access...</p>
        </div>
      </div>
    )
  }

  if (isError || !workspaces || workspaces.length === 0) {
    return <Navigate to="/" replace />
  }

  if (!hasMembership) {
    const routeOrganizationId = normalizedId ? getOrganizationForWorkspace(normalizedId) : null
    const lastOrganizationId = getLastOrganization()
    const sameOrganizationTarget = routeOrganizationId
      ? resolveWorkspaceRedirect(workspaces, {
          preferredWorkspaceIds: [normalizedId, getLastWorkspaceForOrganization(routeOrganizationId)],
          preferredOrganizationIds: [routeOrganizationId],
          fallbackToFirstWorkspace: false,
        })
      : null
    const target =
      sameOrganizationTarget ??
      resolveWorkspaceRedirect(workspaces, {
        preferredWorkspaceIds: [
          getLastWorkspace(),
          lastOrganizationId ? getLastWorkspaceForOrganization(lastOrganizationId) : null,
        ],
        preferredOrganizationIds: [lastOrganizationId],
      })

    if (!target) {
      return <Navigate to="/" replace />
    }

    return <Navigate to={`/w/${toUrlUuid(target.id)}`} replace />
  }

  return (
    <WorkspacePage
      workspaceId={normalizedId}
      workspace={currentWorkspace}
      routeCanvasPath={canvasPath ?? ''}
      key={normalizedId}
    />
  )
}

export default function App() {
  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '')
  const basename = routerBase === '' ? undefined : routerBase

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KeyboardProvider>
          <AuthProvider>
            <PostHogProvider client={posthog}>
              <BrowserRouter basename={basename}>
                <PostHogTracker />
                <ToastContainer />
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/auth/callback" element={<OAuthCallback />} />
                  <Route path="/invite/:token" element={<InviteAcceptPage />} />
                  <Route path="/connections/callback" element={<ConnectionsCallback />} />
                  <Route path="/embed" element={<EmbedBootstrap />} />
                  <Route path="/share/:longHashId" element={<PublicDocumentSharePage />} />
                  <Route
                    path="/cli/authorize"
                    element={
                      <ProtectedRoute>
                        <CliAuthPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <RootRedirect />
                      </ProtectedRoute>
                    }
                  />

                  {/* Workspace route */}
                  <Route
                    path="/w/:workspaceId/*"
                    element={
                      <ProtectedRoute>
                        <WorkspacePageWrapper />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </BrowserRouter>
            </PostHogProvider>
          </AuthProvider>
        </KeyboardProvider>
      </ThemeProvider>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  )
}
