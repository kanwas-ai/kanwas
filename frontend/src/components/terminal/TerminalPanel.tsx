import { useCallback, useEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useSnapshot } from 'valtio/react'
import { Plus, RotateCcw, SquareTerminal, TextCursorInput, Trash2, X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'
import { useUI } from '@/store/useUIStore'
import { useKeyboardShortcut } from '@/providers/keyboard'
import { useTheme } from '@/providers/theme'
import { isDesktopMac } from '@/utils/platform'
import { ResizeHandle } from '@/components/ui/ResizeHandle/ResizeHandle'
import { useResize } from '@/components/ui/ResizeHandle/useResize'
import {
  useTerminalAgents,
  useTerminalSessions,
  type TerminalAgent,
  type TerminalAgentId,
  type TerminalSessionStatus,
} from './useTerminalSessions'
import { TerminalView, type TerminalViewHandle } from './TerminalView'
import { composeContextInsertText } from './insertContext'
import { hasInsertableContext, uiContextStore } from './uiContextStore'

const AGENT_LABELS: Record<TerminalAgentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Shell',
}

// Never changes at runtime - computed once at module load.
const IS_DESKTOP_MAC = isDesktopMac()

function agentLabel(agentId: string, command: string): string {
  return AGENT_LABELS[agentId as TerminalAgentId] ?? command
}

interface TerminalPanelProps {
  workspaceId: string
}

export function TerminalPanel({ workspaceId }: TerminalPanelProps) {
  const { terminalWidth, setTerminalWidth, setTerminalOpen } = useUI()
  const { agents } = useTerminalAgents()
  const { sessions, createSession, deleteSession, setSessions } = useTerminalSessions(workspaceId)
  const { themeMode } = useTheme()

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const viewHandlesRef = useRef<Map<string, TerminalViewHandle>>(new Map())
  const hasSetInitialActiveRef = useRef(false)
  // Read via ref (same pattern as TerminalView) so handleCreateSession always sends the
  // current theme without needing themeMode in its useCallback deps.
  const themeModeRef = useRef(themeMode)
  themeModeRef.current = themeMode

  const { isResizing, resizeRef, handleMouseDown, handleDoubleClick } = useResize({
    direction: 'horizontal',
    position: 'right',
    minSize: 300,
    maxSize: (windowWidth) => windowWidth * 0.7,
    onResize: setTerminalWidth,
    doubleClickToggleRatio: 0.4,
    defaultSize: 480,
    currentSize: terminalWidth,
  })

  // Default the active tab to the first session once the list loads (covers reattaching to
  // sessions that survived a panel close / page reload).
  useEffect(() => {
    if (hasSetInitialActiveRef.current || sessions.length === 0) return
    hasSetInitialActiveRef.current = true
    setActiveSessionId(sessions[0].id)
  }, [sessions])

  const handleStatusChange = useCallback(
    (sessionId: string, status: TerminalSessionStatus, exitCode?: number) => {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status, exitCode } : s)))
    },
    [setSessions]
  )

  const handleCreateSession = useCallback(
    async (agentId: TerminalAgentId) => {
      setMenuOpen(false)
      const session = await createSession(agentId, 80, 24, themeModeRef.current)
      if (session) {
        hasSetInitialActiveRef.current = true
        setActiveSessionId(session.id)
      }
    },
    [createSession]
  )

  // Kill button (header, active tab) and close (X, any tab) both just DELETE — per the plan,
  // a confirm-less kill for running sessions is fine for v1.
  const closeSession = useCallback(
    async (sessionId: string) => {
      viewHandlesRef.current.delete(sessionId)
      await deleteSession(sessionId)
      setActiveSessionId((current) => {
        if (current !== sessionId) return current
        const remaining = sessions.filter((s) => s.id !== sessionId)
        return remaining[0]?.id ?? null
      })
    },
    [deleteSession, sessions]
  )

  const handleClear = useCallback(() => {
    if (activeSessionId) {
      viewHandlesRef.current.get(activeSessionId)?.clear()
    }
  }, [activeSessionId])

  // "Insert context" (WP-C): push the current canvas selection / text selection
  // into the active session's stdin, agent-agnostic (lands like a paste). No-op
  // without a running active session — covers both the header button and the
  // Ctrl+Shift+K shortcut below.
  const uiContext = useSnapshot(uiContextStore)
  const canInsertContext = hasInsertableContext(uiContext)
  const handleInsertContext = useCallback(() => {
    if (!activeSessionId) return
    const handle = viewHandlesRef.current.get(activeSessionId)
    if (!handle) return
    void composeContextInsertText(workspaceId).then((text) => {
      if (text) handle.sendText(text)
    })
  }, [activeSessionId, workspaceId])

  // Registered unconditionally, but TerminalPanel only mounts while the panel is
  // open (see WorkspacePage) — so closing the panel already makes this a no-op.
  useKeyboardShortcut('K', handleInsertContext, { ctrl: true, shift: true, skipInputs: false, preventDefault: true })

  return (
    <aside
      className="terminal-panel relative flex h-full min-h-0 flex-col border-r"
      style={{ width: `${terminalWidth}px`, background: 'var(--canvas)', borderColor: 'var(--sidebar-edge-border)' }}
    >
      <ResizeHandle
        direction="horizontal"
        position="right"
        isResizing={isResizing}
        resizeRef={resizeRef}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />

      {IS_DESKTOP_MAC && <div className="h-7 shrink-0" aria-hidden="true" />}

      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
        style={{ background: 'var(--canvas)', borderColor: 'var(--sidebar-edge-border)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveSessionId(session.id)}
              className={`terminal-tab flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 font-mono text-[11.5px] transition-colors ${
                session.id === activeSessionId ? 'terminal-tab-active' : ''
              }`}
              title={session.command}
            >
              <span
                className={`terminal-status-dot ${
                  session.status === 'running' ? 'terminal-status-dot-running' : 'terminal-status-dot-exited'
                }`}
              />
              <span className="max-w-[110px] truncate">
                {session.title || agentLabel(session.command, session.command)}
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Close ${session.title || session.command}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void closeSession(session.id)
                }}
                className="terminal-tab-close flex items-center justify-center rounded"
              >
                <X size={11} />
              </span>
            </button>
          ))}
        </div>

        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="terminal-icon-btn" aria-label="New terminal session" title="New session">
              <Plus size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="terminal-dropdown-content z-50 min-w-[180px] rounded-md p-1"
              sideOffset={5}
              align="end"
            >
              {agents.length === 0 && (
                <div className="px-2 py-1.5 text-xs opacity-60" style={{ color: 'var(--muted-foreground)' }}>
                  Loading agents…
                </div>
              )}
              {agents.map((agent: TerminalAgent) => (
                <DropdownMenu.Item
                  key={agent.id}
                  disabled={!agent.available}
                  onSelect={() => void handleCreateSession(agent.id)}
                  className="terminal-dropdown-item flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-xs outline-none"
                >
                  <span>{agentLabel(agent.id, agent.command)}</span>
                  {!agent.available && <span className="text-[10px] opacity-60">not installed</span>}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          type="button"
          className="terminal-icon-btn"
          aria-label="Insert selection into agent"
          title="Insert selection into agent (Ctrl+Shift+K)"
          disabled={!activeSessionId || !canInsertContext}
          onClick={handleInsertContext}
        >
          <TextCursorInput size={13} />
        </button>

        <button
          type="button"
          className="terminal-icon-btn"
          aria-label="Clear terminal"
          title="Clear"
          disabled={!activeSessionId}
          onClick={handleClear}
        >
          <RotateCcw size={13} />
        </button>

        <button
          type="button"
          className="terminal-icon-btn"
          aria-label="Kill session"
          title="Kill session"
          disabled={!activeSessionId}
          onClick={() => activeSessionId && void closeSession(activeSessionId)}
        >
          <Trash2 size={13} />
        </button>

        <button
          type="button"
          className="terminal-icon-btn"
          aria-label="Close terminal panel"
          title="Close panel"
          onClick={() => setTerminalOpen(false)}
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {sessions.length === 0 ? (
          <TerminalEmptyState agents={agents} onLaunch={handleCreateSession} />
        ) : (
          sessions.map((session) => (
            <TerminalView
              key={session.id}
              ref={(handle) => {
                if (handle) {
                  viewHandlesRef.current.set(session.id, handle)
                } else {
                  viewHandlesRef.current.delete(session.id)
                }
              }}
              workspaceId={workspaceId}
              sessionId={session.id}
              isActive={session.id === activeSessionId}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function TerminalEmptyState({
  agents,
  onLaunch,
}: {
  agents: TerminalAgent[]
  onLaunch: (agentId: TerminalAgentId) => void
}) {
  return (
    <div className="terminal-empty-state flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <SquareTerminal size={26} style={{ opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
        Launch a coding agent in this workspace's folder
      </p>
      <div className="flex w-full max-w-[220px] flex-col gap-2">
        {agents.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Loading agents…
          </p>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            disabled={!agent.available}
            onClick={() => onLaunch(agent.id)}
            className="terminal-launch-btn flex items-center justify-between gap-2 rounded-md px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{agentLabel(agent.id, agent.command)}</span>
            {!agent.available && <span className="text-[10px] opacity-60">not installed</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
