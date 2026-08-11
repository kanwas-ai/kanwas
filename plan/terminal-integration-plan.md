# Embedded Coding-Agent Terminal — Integration Plan

**Date:** 2026-07-19. Branch: `local-first`. Goal: a real PTY terminal panel on the **left side of the canvas** (where the original Kanwas agent chat lived), so the user runs their own coding agent (Claude Code, Codex, plain shell) at full power inside Kanwas — with UI context (selected document, selected lines) flowing to the agent, like the original agent's mentions did.

Background research (2026-07-19): Tolaria has **no** terminal — it spawns headless `claude -p --output-format stream-json` behind a chat panel. Kanwas never had a real terminal either (only the non-streaming MarvinMenu DebugTerminal). This plan is the terminal route: xterm.js + node-pty, full interactive TUI, agent-agnostic.

## Architecture

```
frontend TerminalPanel (xterm.js)  ←WS (raw PTY bytes + JSON control)→  kanwasd TerminalSessionManager (node-pty)
       │  selection tracking                                                    │ spawns claude/codex/$SHELL, cwd = vault
       └─ debounced POST /ui-context ────────────────────────────────→  in-memory UI context ──→ MCP tool (agent pulls)
       └─ "send to agent" → resolve path/lines → write text into PTY stdin (agent-agnostic push)
```

Two context channels, both "like the agent before":

- **Push** (any agent): select a node / lines → button or shortcut injects `@research/interviews.md` or `research/interviews.md:12-40` into the terminal's stdin (lands in Claude Code's composer like a paste).
- **Pull** (MCP-capable agents): kanwasd exposes a streamable-HTTP MCP endpoint with `kanwas_get_ui_context`; the agent asks "what is the user looking at right now?"

## Work packages

### WP-D — daemon terminal core (`local-daemon`)

- Dep: `node-pty`. New `src/terminal/` — `TerminalSessionManager`: spawn (cwd = workspace folder, env + `TERM=xterm-256color`, `COLORTERM=truecolor`, `KANWAS_WORKSPACE_DIR`), ring scrollback buffer (~1 MB), attach/detach (sessions survive WS disconnect and page reloads; replay buffer on attach), resize, kill (SIGTERM→SIGKILL), reap all on daemon shutdown.
- WS endpoint via `ws` (already a dep) on the existing REST http server (`noServer` + `upgrade` on the :4300 server). Binary frames = PTY bytes both ways; text frames = JSON control (`{type:'resize',cols,rows}` c→s; `{type:'exit',exitCode}` s→c).
- REST (same style as `rest-server.ts`, Bearer local token):
  - `GET  /terminal/agents` → `{agents:[{id:'claude'|'codex'|'shell', command, available, version?}]}` (via `which`)
  - `GET  /workspaces/:id/terminal-sessions` → session list `{id,title,command,status,exitCode?,createdAt}`
  - `POST /workspaces/:id/terminal-sessions` `{agent, cols, rows}` → created session
  - `DELETE /workspaces/:id/terminal-sessions/:sid` → kill + remove
  - WS attach: `GET /workspaces/:id/terminal-sessions/:sid/attach?token=…`
- Vitest coverage: spawn `sh`, echo round-trip, resize, detach/reattach replay, kill, exit event.

### WP-F — frontend terminal panel (`frontend`)

- Deps: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` (+`@xterm/addon-webgl` with canvas fallback).
- `TerminalPanel` as **left flex sibling of the canvas** in `WorkspacePage.tsx` — exactly where `<Chat>` sat pre-removal (see `git show 60a6bf50^:frontend/src/pages/WorkspacePage.tsx`); hidden in zen/fullscreen modes.
- Resize via existing `useResize` (`direction:'horizontal', position:'right', minSize:300, maxSize:w=>w*0.7, defaultSize:480, doubleClickToggleRatio:0.4`); `terminalOpen` + `terminalWidth` persisted in `useUIStore`.
- Toggle: `⌃\`` (via KeyboardProvider) + toolbar button. Closing hides; sessions keep running.
- Header: session tabs (running dot = green pulse, exited = gray), `+` launcher menu (from `GET /terminal/agents`), clear / kill / close controls — per mockup.
- Always-dark warm theme (Kanwas tooltip precedent): bg `#181512`, fg `#d8d3c7`, cursor `#ffb300`, selection `rgba(255,179,0,.25)`, warm ANSI palette (yellow `#e8a300`, green `#4ade80`, blue `#5eb0d3`, red `#f87171`).
- WS URL derived from `VITE_API_URL` (http→ws); token = localStorage `auth_token`. On mount: list sessions, reattach if any; else empty state with launcher buttons.

### WP-C — context passing (both sides; after D+F land)

- Frontend tracks: active canvas, selected node ids (React Flow / NodesSelectionProvider), open document, BlockNote text selection. Debounced (300 ms) `POST /workspaces/:id/ui-context`.
- Daemon: in-memory UI-context store (no file writes — avoids watcher spam); resolves nodeId → relative file path (via the adopt/syncer mapping) and selected text → line range (text match in the `.md` on disk).
- `POST /workspaces/:id/resolve-context` `{nodeId?|text?+nodeId}` → `{path, startLine?, endLine?}` for the push flow.
- Push UX: "Add to agent" button on selection toolbar + shortcut — injects `@<path>` (node) or `<path>:12-40` + quoted snippet (lines) into the focused session's stdin.
- MCP: streamable HTTP at `POST /mcp` (`@modelcontextprotocol/sdk`), tools `kanwas_get_ui_context`, `kanwas_workspace_info`. Seed `.mcp.json` in the vault only when we already seed `AGENTS.md` (empty-folder case); document manual setup otherwise.

## Constraints

- **No git commits by builders or orchestrator** — the user commits. Don't touch unrelated dirty files (`BlockNoteNode.tsx`, `CollapsedCardNode.tsx`, `index.css`, `vite.config.ts`).
- Don't start long-running services; verification = typecheck + unit tests + documented manual steps.
- `node-pty` is a native module — accept the install cost; note prebuild story in README later.

## Definition of done (v1)

Panel opens on the left, `claude` launches in the vault folder with full TUI; sessions survive panel close/page reload; selecting a node and hitting "Add to agent" drops its path into the agent's composer; selecting lines in a note passes `path:Lx-Ly`; MCP `kanwas_get_ui_context` returns live selection; agent file writes flash on the canvas via the existing watcher (already works).
