import { createContext } from 'react'

export interface User {
  id: string
  email: string
  name: string
}

export interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

export interface AuthResult {
  workspaceId?: string
}

export interface GoogleLoginOptions {
  code?: string
  state?: string
}

export interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<AuthResult>
  register: (email: string, password: string, name?: string) => Promise<AuthResult>
  logout: () => Promise<void>
  loginWithGoogle: (options?: GoogleLoginOptions) => Promise<AuthResult>
  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
