// REST client for the kanwasd terminal endpoints (see plan/terminal-integration-plan.md, WP-D contract).
// Follows the same baseURL/auth conventions as `@/api/client.ts` (in local-daemon mode `VITE_API_URL`
// already points at kanwasd, so no separate env var is needed) and the plain-`fetch` pattern used by
// `@/api/publicClient.ts` (the daemon's terminal routes aren't part of the generated Adonis `tuyau` client).
import { useCallback, useEffect, useState } from 'react'
import { baseURL } from '@/api/client'
import { TOKEN_KEY } from '@/providers/auth/tokenKey'

export type TerminalAgentId = 'claude' | 'codex' | 'shell'

export interface TerminalAgent {
  id: TerminalAgentId
  command: string
  available: boolean
  version?: string
}

export type TerminalSessionStatus = 'running' | 'exited'

export interface TerminalSession {
  id: string
  title: string
  command: string
  status: TerminalSessionStatus
  exitCode?: number
  createdAt: string
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

// Exported for other terminal-panel modules that need the same daemon-relative
// fetch (WP-C: uiContextReporter.ts, insertContext.ts) — same baseURL/auth
// conventions, kept in one place.
export async function daemonFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  const token = getAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(new URL(path, baseURL), { ...init, headers })
}

/** Builds the WS attach URL for a terminal session: baseURL with http→ws + Bearer token as a query param. */
export function terminalWsUrl(workspaceId: string, sessionId: string): string {
  const wsBaseURL = baseURL.replace(/^http/, 'ws')
  const url = new URL(`/workspaces/${workspaceId}/terminal-sessions/${sessionId}/attach`, wsBaseURL)

  const token = getAuthToken()
  if (token) {
    url.searchParams.set('token', token)
  }

  return url.toString()
}

// The plan documents GET /terminal/agents as `{agents:[...]}` but only shows the session shape
// (not the envelope) for GET /workspaces/:id/terminal-sessions. Accept either a bare array or a
// `{sessions:[...]}` wrapper so this doesn't break depending on how the daemon actually serializes it.
function normalizeSessionsResponse(data: unknown): TerminalSession[] {
  if (Array.isArray(data)) {
    return data
  }
  if (data && typeof data === 'object' && Array.isArray((data as { sessions?: unknown }).sessions)) {
    return (data as { sessions: TerminalSession[] }).sessions
  }
  return []
}

export function useTerminalAgents() {
  const [agents, setAgents] = useState<TerminalAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await daemonFetch('/terminal/agents')
      if (!res.ok) throw new Error(`Failed to load terminal agents: ${res.status}`)
      const data = (await res.json()) as { agents?: TerminalAgent[] }
      setAgents(data.agents ?? [])
    } catch (e) {
      console.error('Failed to load terminal agents:', e)
      setAgents([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { agents, isLoading, refetch }
}

export function useTerminalSessions(workspaceId: string) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await daemonFetch(`/workspaces/${workspaceId}/terminal-sessions`)
      if (!res.ok) throw new Error(`Failed to load terminal sessions: ${res.status}`)
      const data: unknown = await res.json()
      setSessions(normalizeSessionsResponse(data))
    } catch (e) {
      console.error('Failed to load terminal sessions:', e)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const createSession = useCallback(
    async (
      agent: TerminalAgentId,
      cols: number,
      rows: number,
      theme: 'light' | 'dark'
    ): Promise<TerminalSession | null> => {
      if (!workspaceId) return null
      try {
        const res = await daemonFetch(`/workspaces/${workspaceId}/terminal-sessions`, {
          method: 'POST',
          body: JSON.stringify({ agent, cols, rows, theme }),
        })
        if (!res.ok) throw new Error(`Failed to create terminal session: ${res.status}`)
        const session = (await res.json()) as TerminalSession
        setSessions((prev) => [...prev, session])
        return session
      } catch (e) {
        console.error('Failed to create terminal session:', e)
        return null
      }
    },
    [workspaceId]
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceId) return
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      try {
        const res = await daemonFetch(`/workspaces/${workspaceId}/terminal-sessions/${sessionId}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error(`Failed to delete terminal session: ${res.status}`)
      } catch (e) {
        console.error('Failed to delete terminal session:', e)
      }
    },
    [workspaceId]
  )

  return { sessions, isLoading, refetch, createSession, deleteSession, setSessions }
}
