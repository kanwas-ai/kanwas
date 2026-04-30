import { useCallback, useEffect, useRef, useState } from 'react'
import { tuyau } from '@/api/client'

interface CachedToken {
  token: string
  expiresAtMs: number
}

interface TuyauWithYjsSocketToken {
  workspaces: (args: { id: string }) => {
    'yjs-socket-token': {
      $post: (body?: unknown) => Promise<{
        data: { token?: string; expiresAt?: string } | null
        error: { message?: string } | null
      }>
    }
  }
}

interface YjsSocketTokenHandle {
  error: Error | null
  getToken: () => string | undefined
  isReady: boolean
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function useYjsSocketToken(workspaceId: string): YjsSocketTokenHandle {
  const cachedRef = useRef<CachedToken | null>(null)
  const inFlightRef = useRef<Promise<string> | null>(null)
  const workspaceIdRef = useRef(workspaceId)
  workspaceIdRef.current = workspaceId
  const [readyWorkspaceId, setReadyWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    cachedRef.current = null
    inFlightRef.current = null
    setReadyWorkspaceId(null)
    setError(null)
  }, [workspaceId])

  const refresh = useCallback(async (): Promise<string> => {
    if (inFlightRef.current) {
      return inFlightRef.current
    }

    const requestedWorkspaceId = workspaceId
    const promise = (async (): Promise<string> => {
      try {
        const workspaceClient = (tuyau as unknown as TuyauWithYjsSocketToken).workspaces({ id: requestedWorkspaceId })
        const { data, error } = await workspaceClient['yjs-socket-token'].$post()
        if (error || !data?.token || !data.expiresAt) {
          throw new Error(error?.message ?? 'Failed to mint Yjs socket token')
        }

        const expiresAtMs = Date.parse(data.expiresAt)
        if (workspaceIdRef.current === requestedWorkspaceId) {
          cachedRef.current = {
            token: data.token,
            expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 3_600_000,
          }
          setError(null)
          setReadyWorkspaceId(requestedWorkspaceId)
        }
        return data.token
      } catch (err) {
        if (workspaceIdRef.current === requestedWorkspaceId) {
          setError(toError(err))
          setReadyWorkspaceId(null)
        }
        throw err
      }
    })()

    const trackedPromise: Promise<string> = promise.finally(() => {
      if (inFlightRef.current === trackedPromise) {
        inFlightRef.current = null
      }
    })
    inFlightRef.current = trackedPromise
    return trackedPromise
  }, [workspaceId])

  // Kick off the initial fetch so the very first handshake has a token available.
  useEffect(() => {
    void refresh().catch((err) => {
      console.warn('[useYjsSocketToken] initial fetch failed:', err)
    })
  }, [refresh])

  const getToken = useCallback(() => {
    const cached = cachedRef.current
    if (!cached) {
      void refresh().catch((err) => {
        console.warn('[useYjsSocketToken] refresh failed:', err)
      })
      return undefined
    }

    const msUntilExpiry = cached.expiresAtMs - Date.now()
    if (msUntilExpiry < 60_000) {
      void refresh().catch((err) => {
        console.warn('[useYjsSocketToken] refresh failed:', err)
      })
    }

    return cached.token
  }, [refresh])

  return { error, getToken, isReady: readyWorkspaceId === workspaceId && cachedRef.current !== null }
}
