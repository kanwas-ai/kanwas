import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { getTerminalTheme, terminalFontFamily, terminalFontSize, terminalLineHeight } from './xtermTheme'
import { terminalWsUrl, type TerminalSessionStatus } from './useTerminalSessions'
import { createAnsiThemeRewriter } from './ansiRewrite'
import { useTheme } from '@/providers/theme'

export interface TerminalViewHandle {
  clear: () => void
  /** Writes `text` into the session's stdin as a binary frame (WP-C "Insert context" push — see TerminalPanel). */
  sendText: (text: string) => void
}

interface TerminalViewProps {
  workspaceId: string
  sessionId: string
  /** Active tab is rendered `display:block`; inactive tabs stay mounted (display:none) to keep scrollback. */
  isActive: boolean
  onStatusChange: (sessionId: string, status: TerminalSessionStatus, exitCode?: number) => void
}

type ControlMessage = { type: 'exit'; exitCode: number } | { type: 'resize'; cols: number; rows: number }

function isControlMessage(value: unknown): value is ControlMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/**
 * Mounts one xterm.js Terminal per session and attaches it to the local runtime over a WebSocket.
 * The Terminal instance and its WS connection live for as long as this component is mounted —
 * TerminalPanel keeps one TerminalView per session mounted (just hidden via `isActive`) so
 * switching tabs never tears down scrollback. On unmount the WS is closed but the session is
 * left running in the runtime; remounting (e.g. reopening the panel) reattaches and the runtime
 * replays its scrollback buffer.
 */
export const TerminalView = memo(
  forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
    { workspaceId, sessionId, isActive, onStatusChange },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const isActiveRef = useRef(isActive)
    isActiveRef.current = isActive
    const { themeMode } = useTheme()
    const themeModeRef = useRef(themeMode)
    themeModeRef.current = themeMode

    useImperativeHandle(
      ref,
      () => ({
        clear: () => termRef.current?.clear(),
        sendText: (text: string) => {
          // Stdin MUST be a binary frame, same as interactive keystrokes below —
          // the runtime routes text frames to the JSON control parser instead.
          const socket = wsRef.current
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(new TextEncoder().encode(text))
          }
        },
      }),
      []
    )

    // Mount the Terminal + open the WS attach once per session. Deliberately not re-run on
    // `isActive` changes — see the effect below for the tab-switch fit/resize handling.
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const term = new Terminal({
        theme: getTerminalTheme(themeModeRef.current),
        fontFamily: terminalFontFamily,
        fontSize: terminalFontSize,
        lineHeight: terminalLineHeight,
        cursorBlink: true,
        allowProposedApi: true,
        scrollback: 5000,
        // CLIs inside the terminal emit truecolor/256-color codes assuming a dark background
        // (bypassing our ITheme palette entirely), so a light-mode host can get illegible
        // low-contrast text (e.g. light-gray on light background). This nudges foreground
        // colors at render time to meet a contrast ratio against the actual cell background.
        // 4.5 = WCAG AA, same default VS Code's integrated terminal uses.
        minimumContrastRatio: 4.5,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(container)

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Only fit while visible — a display:none container reports 0x0 dimensions.
      if (isActiveRef.current) {
        try {
          fitAddon.fit()
        } catch {
          // container not laid out yet, ignore
        }
      }

      const ws = new WebSocket(terminalWsUrl(workspaceId, sessionId))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      // Fresh per-connection state: a streaming UTF-8 decoder (codepoints can split across
      // WS frames) and the ANSI rewriter that patches Claude Code's hardcoded dark
      // transcript-bar background in light mode (see ansiRewrite.ts).
      const decoder = new TextDecoder()
      const rewriter = createAnsiThemeRewriter(() => themeModeRef.current)

      const sendResize = () => {
        const socket = wsRef.current
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }

      ws.onopen = () => {
        if (isActiveRef.current) {
          sendResize()
        }
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          let message: unknown
          try {
            message = JSON.parse(event.data)
          } catch (e) {
            console.error('Failed to parse terminal control message:', e)
            return
          }

          if (isControlMessage(message) && message.type === 'exit') {
            term.write(`\r\n\x1b[90m[process exited with code ${message.exitCode}]\x1b[0m\r\n`)
            onStatusChange(sessionId, 'exited', message.exitCode)
          }
          return
        }

        const decoded = decoder.decode(new Uint8Array(event.data as ArrayBuffer), { stream: true })
        term.write(rewriter.transform(decoded))
      }

      // Stdin MUST be a binary frame — the runtime routes text frames to the JSON
      // control parser, so a plain string send would silently drop every keystroke.
      const encoder = new TextEncoder()
      const dataDisposable = term.onData((data) => {
        const socket = wsRef.current
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(encoder.encode(data))
        }
      })

      const resizeObserver = new ResizeObserver(() => {
        if (!isActiveRef.current) return
        try {
          fitAddon.fit()
        } catch {
          return
        }
        sendResize()
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        dataDisposable.dispose()
        ws.close()
        wsRef.current = null
        term.dispose()
        termRef.current = null
        fitAddonRef.current = null
      }
      // Session identity owns the lifecycle; onStatusChange is stable (memoized upstream).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, sessionId])

    // Re-fit and re-focus whenever this tab becomes the active one (covers both the panel-resize
    // and tab-switch cases called out in the contract).
    useEffect(() => {
      if (!isActive) return

      const term = termRef.current
      const fitAddon = fitAddonRef.current
      if (!term || !fitAddon) return

      try {
        fitAddon.fit()
      } catch {
        return
      }

      const socket = wsRef.current
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }

      term.focus()
    }, [isActive])

    // Live-update the colors of an already-mounted terminal when the app's theme changes,
    // without tearing down the session (the mount effect above deliberately excludes themeMode).
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = getTerminalTheme(themeMode)
      }
    }, [themeMode])

    return (
      <div
        ref={containerRef}
        className="terminal-view-container absolute inset-0"
        style={{ display: isActive ? 'block' : 'none' }}
      />
    )
  })
)
