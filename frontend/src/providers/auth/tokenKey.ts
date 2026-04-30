const rawTokenKey = import.meta.env.VITE_AUTH_TOKEN_KEY ?? 'auth_token'

export const TOKEN_KEY: string = (rawTokenKey || 'auth_token').trim()
