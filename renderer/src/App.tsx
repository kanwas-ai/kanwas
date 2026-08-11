import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KeyboardProvider } from '@/providers/keyboard'
import { ThemeProvider } from '@/providers/theme'
import { ToastContainer } from '@/components/ui/Toast'
import { isVaultSummary, useWorkspaces } from '@/hooks/useWorkspaces'
import { rememberWorkspaceVisit } from '@/hooks/workspaceStorage'
import { getDesktopBridge } from '@/lib/desktop'
import { noteSaveCoordinator } from '@/lib/noteSaveCoordinator'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { RootRedirect } from '@/pages/RootRedirect'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function WorkspacePageWrapper() {
  const { 'workspaceId': routeId, '*': canvasPath } = useParams<{ 'workspaceId': string; '*': string }>()
  const { data: workspaces, isLoading, isError } = useWorkspaces()
  const workspace = routeId
    ? workspaces?.find(
        (candidate) =>
          (candidate.urlId === routeId || candidate.id === routeId) &&
          (!isVaultSummary(candidate) || candidate.status === 'mounted')
      )
    : undefined

  useEffect(() => {
    if (workspace) rememberWorkspaceVisit(workspace.id)
  }, [workspace])

  if (!routeId) return <Navigate to="/" replace />

  if (isLoading) {
    return <FullScreenMessage title="Opening vault…" detail="Loading your local workspace." />
  }

  if (isError || !workspace) return <Navigate to="/" replace />

  return <WorkspacePage workspaceId={workspace.id} routeCanvasPath={canvasPath ?? ''} key={workspace.id} />
}

function FullScreenMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas text-foreground">
      <div className="text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-foreground/60">{detail}</p>
      </div>
    </div>
  )
}

export default function App() {
  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '')

  useEffect(() => {
    const desktop = getDesktopBridge()
    if (!desktop) return

    return desktop.onPrepareToQuit(() => {
      void noteSaveCoordinator.flushAll().finally(() => desktop.readyToQuit())
    })
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KeyboardProvider>
          <BrowserRouter basename={routerBase || undefined}>
            <ToastContainer />
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/w/:workspaceId/*" element={<WorkspacePageWrapper />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </KeyboardProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
