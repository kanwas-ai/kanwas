// Coding-agent detection for the embedded terminal (WP-D). Kanwas doesn't
// bundle or manage these binaries — it just spawns whatever the user already
// has on their PATH inside a PTY. `shell` is always available (it falls back
// to $SHELL, and every OS has one); `claude`/`codex` are detected via `which`.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type AgentId = 'claude' | 'codex' | 'shell'

const AGENT_IDS: readonly AgentId[] = ['claude', 'codex', 'shell']

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}

export interface AgentInfo {
  id: AgentId
  /** The literal command spawned for this agent (see agentSpawnSpec). */
  command: string
  available: boolean
  /** Optional; intentionally never populated (a `--version` round-trip is too slow for a GET). */
  version?: string
}

/** file + args node-pty spawns for a given agent id. cwd/env are supplied by the session manager. */
export interface AgentSpawnSpec {
  command: string
  args: string[]
}

export function agentSpawnSpec(agent: AgentId): AgentSpawnSpec {
  switch (agent) {
    case 'claude':
      return { command: 'claude', args: [] }
    case 'codex':
      return { command: 'codex', args: [] }
    case 'shell':
      return { command: process.env.SHELL || '/bin/zsh', args: ['-l'] }
  }
}

/** True if `command` resolves on PATH (POSIX `which`; Windows is out of scope, see README). */
async function which(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command])
    return true
  } catch {
    return false
  }
}

/**
 * Detect which agents are available right now. Cheap enough (`which` is a
 * single fork+exec) to re-run on every `GET /terminal/agents` rather than
 * cache — always reflects the current PATH, e.g. after the user installs a
 * CLI mid-session.
 */
export async function detectAgents(): Promise<AgentInfo[]> {
  const [claudeAvailable, codexAvailable] = await Promise.all([which('claude'), which('codex')])
  return [
    { id: 'claude', command: agentSpawnSpec('claude').command, available: claudeAvailable },
    { id: 'codex', command: agentSpawnSpec('codex').command, available: codexAvailable },
    { id: 'shell', command: agentSpawnSpec('shell').command, available: true },
  ]
}
