import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isVaultSummary, useWorkspaces } from '@/hooks/useWorkspaces'
import { getLastWorkspace } from '@/hooks/workspaceStorage'
import { EmptyWorkspace } from './EmptyWorkspace'

export function RootRedirect() {
  const navigate = useNavigate()
  const { data: workspaces, isLoading, isError, error, refetch } = useWorkspaces()

  useEffect(() => {
    if (isLoading || !workspaces?.length) return
    const mounted = workspaces.filter((workspace) => !isVaultSummary(workspace) || workspace.status === 'mounted')
    if (mounted.length === 0) return
    const lastWorkspaceId = getLastWorkspace()
    const target = mounted.find((workspace) => workspace.id === lastWorkspaceId) ?? mounted[0]
    navigate(`/w/${target.urlId}`, { replace: true })
  }, [isLoading, navigate, workspaces])

  if (isLoading) {
    return <EmptyWorkspace state="loading" onRetry={() => void refetch()} />
  }

  if (isError) {
    return (
      <EmptyWorkspace
        state="error"
        error={error instanceof Error ? error.message : 'The local runtime could not be reached.'}
        onRetry={() => void refetch()}
      />
    )
  }

  const mounted = workspaces?.filter((workspace) => !isVaultSummary(workspace) || workspace.status === 'mounted') ?? []
  if (mounted.length === 0) {
    return (
      <EmptyWorkspace state="empty" vaults={workspaces?.filter(isVaultSummary) ?? []} onRetry={() => void refetch()} />
    )
  }

  return null
}
