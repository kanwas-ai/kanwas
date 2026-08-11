import React, { useCallback, useRef, useEffect, type ReactNode } from 'react'
import { proxy } from 'valtio'
import { AuthContext, type AuthState, type User } from './AuthContext'
import { TOKEN_KEY } from './tokenKey'
import { tuyau, setAuthToken } from '@/api/client'
import { showToast } from '@/utils/toast'
import { useQueryClient } from '@tanstack/react-query'
import { clearPendingInviteToken, getPendingInviteToken, isInvalidInviteTokenMessage } from '@/lib/pendingInvite'
import { clearPendingGoogleOAuthState, getPendingGoogleOAuthState, setPendingGoogleOAuthState } from '@/lib/oauthState'
import type { AuthResult, GoogleLoginOptions } from './AuthContext'

interface AuthProviderProps {
  children: ReactNode
}

const AUTH_COOKIE_NAME = 'kanwas_logged_in'

function toAuthUser(value: unknown): User | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { id?: unknown; email?: unknown; name?: unknown }
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string' || typeof candidate.name !== 'string') {
    return null
  }

  return {
    id: candidate.id,
    email: candidate.email,
    name: candidate.name,
  }
}

function setAuthCookie() {
  const isSecure = window.location.protocol === 'https:'
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=1`,
    'path=/',
    'max-age=31536000', // 1 year
    'SameSite=Lax',
  ]
  if (isSecure) {
    cookieParts.push('Secure')
  }
  document.cookie = cookieParts.join('; ')
}

function removeAuthCookie() {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const state = useRef(
    proxy<AuthState>({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,
    })
  ).current

  const queryClient = useQueryClient()

  const parseErrorMessage = useCallback((error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object') {
      const responseError = error as { error?: string; message?: string }
      if (responseError.error) return responseError.error
      if (responseError.message) return responseError.message
    }

    return fallbackMessage
  }, [])

  const handleInviteAwareError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const message = parseErrorMessage(error, fallbackMessage)
      if (isInvalidInviteTokenMessage(message)) {
        clearPendingInviteToken()
      }

      return message
    },
    [parseErrorMessage]
  )

  const applyToken = useCallback(
    (token: string | null) => {
      state.token = token
      state.isAuthenticated = Boolean(token)
      if (token) {
        localStorage.setItem(TOKEN_KEY, token)
        setAuthToken(token)
        setAuthCookie()
      } else {
        localStorage.removeItem(TOKEN_KEY)
        setAuthToken(null)
        removeAuthCookie()
        state.user = null
      }
    },
    [state]
  )

  const setUser = useCallback(
    (user: User | null) => {
      state.user = user
    },
    [state]
  )

  const syncCurrentUser = useCallback(
    async (clearTokenOnFailure: boolean) => {
      if (!state.token) {
        setUser(null)
        return null
      }

      let response: Awaited<ReturnType<typeof tuyau.auth.me.$get>>

      try {
        response = await tuyau.auth.me.$get()
      } catch (error) {
        if (clearTokenOnFailure) {
          applyToken(null)
        }

        throw error
      }

      if (response.error) {
        if (clearTokenOnFailure) {
          applyToken(null)
        }
        throw response.error
      }

      const user = toAuthUser(response.data)
      setUser(user)
      queryClient.setQueryData(['me'], response.data)
      return user
    },
    [applyToken, queryClient, setUser, state]
  )

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuthState = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      applyToken(storedToken)

      if (storedToken) {
        try {
          await syncCurrentUser(true)
        } catch {
          // Invalid or expired token should silently reset auth state.
        }
      }

      state.isLoading = false
    }

    void initializeAuthState()
  }, [applyToken, state, syncCurrentUser])

  const login = async (email: string, password: string): Promise<AuthResult> => {
    const inviteToken = getPendingInviteToken()

    try {
      const response = await tuyau.auth.login.$post(
        inviteToken ? { email, password, inviteToken } : { email, password }
      )

      if (response.error) {
        throw response.error
      }

      const responseData = response.data
      if (!responseData) {
        throw new Error('Login request completed without a response payload')
      }

      const { value: token, workspaceId } = responseData

      applyToken(token)
      await syncCurrentUser(true)

      if (inviteToken) {
        clearPendingInviteToken()
      }

      showToast('Successfully logged in!', 'success')
      return { workspaceId }
    } catch (error) {
      const message = handleInviteAwareError(error, 'Login failed')
      showToast(message, 'error')
      throw error
    }
  }

  const register = async (email: string, password: string, name?: string): Promise<AuthResult> => {
    const inviteToken = getPendingInviteToken()

    try {
      const response = await tuyau.auth.register.$post(
        inviteToken ? { email, password, inviteToken } : { email, password, ...(name ? { name } : {}) }
      )

      if (response.error) {
        throw response.error
      }

      const responseData = response.data
      if (!responseData) {
        throw new Error('Registration request completed without a response payload')
      }

      const { value: token, workspaceId } = responseData

      applyToken(token)
      await syncCurrentUser(true)

      if (inviteToken) {
        clearPendingInviteToken()
      }

      showToast('Successfully registered!', 'success')
      return { workspaceId }
    } catch (error) {
      const message = handleInviteAwareError(error, 'Registration failed')
      showToast(message, 'error')
      throw error
    }
  }

  const logout = async () => {
    try {
      if (state.token) {
        await tuyau.auth.logout.$post()
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      applyToken(null)
      queryClient.clear()
      showToast('Successfully logged out', 'success')
    }
  }

  const loginWithGoogle = async (options?: GoogleLoginOptions): Promise<AuthResult> => {
    const inviteToken = getPendingInviteToken()

    try {
      if (options?.code) {
        if (!options.state) {
          throw new Error('Google login failed: missing OAuth state')
        }

        const pendingOAuthState = getPendingGoogleOAuthState()
        if (!pendingOAuthState || pendingOAuthState !== options.state) {
          throw new Error('Google login failed: invalid OAuth state')
        }

        clearPendingGoogleOAuthState()

        // Exchange code for token
        const response = await tuyau.auth.google.callback.$post({ code: options.code, state: options.state })

        if (response.error) {
          throw response.error
        }

        const responseData = response.data
        if (!responseData) {
          throw new Error('Google login request completed without a response payload')
        }

        const { value: token, workspaceId } = responseData

        applyToken(token)
        await syncCurrentUser(true)

        if (workspaceId) {
          clearPendingInviteToken()
        }

        showToast('Successfully logged in with Google!', 'success')
        return { workspaceId }
      } else {
        // Get Google OAuth URL and redirect
        const response = await tuyau.auth.google.url.$get(inviteToken ? { query: { inviteToken } } : undefined)

        if (response.error) {
          throw response.error
        }

        const { url } = response.data
        const oauthState = new URL(url, window.location.origin).searchParams.get('state')

        if (!oauthState) {
          throw new Error('Google login failed: missing OAuth state')
        }

        setPendingGoogleOAuthState(oauthState)
        window.location.href = url
        return {}
      }
    } catch (error) {
      const message = handleInviteAwareError(error, 'Google login failed')
      showToast(message, 'error')
      throw error
    }
  }

  const setToken = (token: string | null) => {
    applyToken(token)
    if (!token) {
      setUser(null)
      return
    }

    void syncCurrentUser(false).catch(() => {
      // Best-effort sync for embed/bootstrap flows.
    })
  }

  const value = {
    state,
    login,
    register,
    logout,
    loginWithGoogle,
    setToken,
    setUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
