import { useContext } from 'react'
import { useSnapshot } from 'valtio'
import { AuthContext } from './AuthContext'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const useAuthState = () => {
  const { state } = useAuth()
  return useSnapshot(state)
}
