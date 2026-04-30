import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthState } from '@/providers/auth'
import { setReturnTo } from '@/lib/returnTo'
import { initTipStore } from '@/store/useTipStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuthState()
  const location = useLocation()

  // Sync tip store with backend once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void initTipStore()
    }
  }, [isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    const returnPath = location.pathname + location.search
    if (returnPath !== '/') {
      setReturnTo(returnPath)
    }
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
