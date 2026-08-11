import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/providers/auth'
import { clearPendingGoogleOAuthState, getPendingGoogleOAuthState } from '@/lib/oauthState'
import { clearReturnTo } from '@/lib/returnTo'
import { toUrlUuid } from '@/utils/uuid'

export const OAuthCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithGoogle } = useAuth()

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const pendingState = getPendingGoogleOAuthState()

      if (!code) {
        // No code parameter, redirect to login
        clearPendingGoogleOAuthState()
        navigate('/login', { replace: true })
        return
      }

      if (!state || !pendingState || state !== pendingState) {
        // Missing or mismatched local state indicates an invalid or stale OAuth callback
        clearPendingGoogleOAuthState()
        navigate('/login', { replace: true })
        return
      }

      try {
        const result = await loginWithGoogle({ code, state })
        const returnTo = clearReturnTo()
        if (returnTo) {
          navigate(returnTo, { replace: true })
          return
        }
        if (result.workspaceId) {
          navigate(`/w/${toUrlUuid(result.workspaceId)}`, { replace: true })
          return
        }

        navigate('/', { replace: true })
      } catch {
        // Error is handled by AuthProvider with toast
        // Redirect to login on failure
        navigate('/login', { replace: true })
      } finally {
        clearPendingGoogleOAuthState()
      }
    }

    handleCallback()
  }, [searchParams, navigate, loginWithGoogle])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-gray-600 dark:text-gray-400">Completing sign in...</div>
    </div>
  )
}
