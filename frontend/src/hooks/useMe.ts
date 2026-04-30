import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tuyau } from '@/api/client'
import { useAuth } from '@/providers/auth'
import { showToast } from '@/utils/toast'
import type { User } from '@/providers/auth/AuthContext'

type ApiError = { error?: string; message?: string }

function toError(error: unknown, fallbackMessage: string): Error {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.error) return new Error(apiError.error)
    if (apiError.message) return new Error(apiError.message)
  }

  return new Error(fallbackMessage)
}

export const getCurrentUser = async (): Promise<User> => {
  const response = await tuyau.auth.me.$get()
  if (response.error) {
    throw toError(response.error, 'Failed to load profile')
  }

  return response.data as User
}

export const updateCurrentUserName = async (name: string): Promise<User> => {
  const response = await tuyau.auth.me.$patch({ name })
  if (response.error) {
    throw toError(response.error, 'Failed to update profile')
  }

  return response.data as User
}

export const useMe = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['me'],
    queryFn: getCurrentUser,
    enabled,
    staleTime: 10 * 60 * 1000, // Consider fresh for 10 minutes
    retry: false, // Don't retry on 401
  })
}

export const useUpdateProfileName = () => {
  const qc = useQueryClient()
  const { setUser } = useAuth()

  return useMutation({
    mutationFn: updateCurrentUserName,
    onSuccess: (user) => {
      qc.setQueryData(['me'], user)
      setUser(user)
      qc.invalidateQueries({ queryKey: ['organization-members'] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspace'] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update profile'
      showToast(message, 'error')
    },
  })
}
