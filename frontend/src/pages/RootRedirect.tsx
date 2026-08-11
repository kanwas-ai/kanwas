import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toUrlUuid } from '@/utils/uuid'
import { getLastOrganization, getLastWorkspace, getLastWorkspaceForOrganization } from '@/hooks/workspaceStorage'
import { resolveWorkspaceRedirect } from '@/lib/workspaceRedirect'

/**
 * Handles initial app load after authentication
 * Redirects user to their last active workspace, or first workspace as fallback
 *
 * Flow:
 * 1. User lands on "/"
 * 2. Fetch all workspaces
 * 3. Redirect to last active workspace (if still accessible) or first workspace
 */
export function RootRedirect() {
  const navigate = useNavigate()
  const { data: workspaces, isLoading, isError, error } = useWorkspaces()

  useEffect(() => {
    if (!isLoading && workspaces && workspaces.length > 0) {
      const lastOrganizationId = getLastOrganization()
      const target = resolveWorkspaceRedirect(workspaces, {
        preferredWorkspaceIds: [
          getLastWorkspace(),
          lastOrganizationId ? getLastWorkspaceForOrganization(lastOrganizationId) : null,
        ],
        preferredOrganizationIds: [lastOrganizationId],
      })

      if (!target) {
        return
      }

      navigate(`/w/${toUrlUuid(target.id)}`, { replace: true })
    }
  }, [workspaces, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="mb-4">Loading....</div>
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load workspaces</h2>
          <p className="text-gray-600 mb-6">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No workspaces found</h2>
          <p className="text-gray-600">
            This shouldn't happen. A workspace is created automatically when you sign up. Please contact support if this
            persists.
          </p>
        </div>
      </div>
    )
  }

  return null
}
