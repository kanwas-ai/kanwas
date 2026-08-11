// REST client for the embedded local runtime's terminal endpoints.
import { useCallback, useEffect, useState } from 'react'
import { baseURL, localFetch } from '@/api/client'
import type { TerminalAgent, TerminalAgentId, TerminalSession } from 'shared/local-api'

export type { TerminalAgent, TerminalAgentId, TerminalSession } from 'shared/local-api'
export type TerminalSessionStatus = TerminalSession['status']

// Exported for terminal-panel modules that share the runtime-relative API client.
export const runtimeFetch = localFetch

/** Builds the same-origin WebSocket attach URL for a terminal session. */
export function terminalWsUrl(workspaceId: string, sessionId: string): string {
  const wsBaseURL = baseURL.replace(/^http/, 'ws')
  return new URL(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/terminal-sessions/${encodeURIComponent(sessionId)}/attach`,
    wsBaseURL
  ).toString()
}

// The plan documents GET /terminal/agents as `{agents:[...]}` but only shows the session shape
// (not the envelope) for GET /workspaces/:id/terminal-sessions. Accept either a bare array or a
// `{sessions:[...]}` wrapper for compatibility with both local runtime response shapes.
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
      const res = await runtimeFetch('/terminal/agents')
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
      const res = await runtimeFetch(`/workspaces/${workspaceId}/terminal-sessions`)
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
        const res = await runtimeFetch(`/workspaces/${workspaceId}/terminal-sessions`, {
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
        const res = await runtimeFetch(`/workspaces/${workspaceId}/terminal-sessions/${sessionId}`, {
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
