// Cross-platform coding-agent discovery for the embedded desktop terminal.
// This intentionally avoids POSIX-only `which`: GUI-launched Electron apps
// have a sparse PATH on macOS, and Windows also needs PATHEXT-aware lookup.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type AgentId = 'claude' | 'codex' | 'shell'

const AGENT_IDS: readonly AgentId[] = ['claude', 'codex', 'shell']
const MAC_PATH_MARKER = '__KANWAS_LOGIN_PATH__'

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}

export interface AgentInfo {
  id: AgentId
  command: string
  available: boolean
  version?: string
}

export interface AgentSpawnSpec {
  command: string
  args: string[]
}

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

function searchPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const entries = (env.PATH ?? '').split(pathDelimiter(platform)).filter(Boolean)
  if (platform === 'darwin') {
    entries.push('/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'))
  }
  return [...new Set(entries)]
}

function executableExtensions(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return ['']
  const configured = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
    .map((extension) => extension.toLowerCase())
  return ['', ...configured]
}

/** Resolve a command without invoking a shell. Platform is injectable for Windows unit tests. */
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  const hasSeparator = command.includes('/') || command.includes('\\')
  const directories = hasSeparator ? [''] : searchPath(env, platform)
  const extensions = path.extname(command) ? [''] : executableExtensions(env, platform)
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory ? path.join(directory, `${command}${extension}`) : `${command}${extension}`
      try {
        if (!fs.statSync(candidate).isFile()) continue
        if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        // Try the next PATH/PATHEXT combination.
      }
    }
  }
  return undefined
}

export function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function wrapWindowsScript(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): AgentSpawnSpec {
  const extension = path.extname(command).toLowerCase()
  if (platform !== 'win32' || (extension !== '.cmd' && extension !== '.bat')) return { command, args }
  const comspec = env.ComSpec || env.COMSPEC || 'cmd.exe'
  return { command: comspec, args: ['/d', '/s', '/c', [quoteForCmd(command), ...args.map(quoteForCmd)].join(' ')] }
}

function shellSpec(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): AgentSpawnSpec {
  if (platform !== 'win32') {
    return { command: env.SHELL || '/bin/zsh', args: ['-l'] }
  }
  const preferred = resolveCommand('pwsh.exe', env, platform) ?? resolveCommand('powershell.exe', env, platform)
  if (preferred) return { command: preferred, args: ['-NoLogo'] }
  return { command: env.ComSpec || env.COMSPEC || 'cmd.exe', args: [] }
}

export function agentSpawnSpec(
  agent: AgentId,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): AgentSpawnSpec {
  if (agent === 'shell') return shellSpec(env, platform)
  const resolved = resolveCommand(agent, env, platform)
  return resolved ? wrapWindowsScript(resolved, [], env, platform) : { command: agent, args: [] }
}

let macEnvironmentTask: Promise<void> | undefined

/**
 * Electron launched from Finder receives a minimal PATH. Ask the user's login
 * shell for its PATH once, then merge it into the process environment used by
 * agent discovery and PTYs. Failure or a slow shell is non-fatal.
 */
export function hydrateTerminalEnvironment(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  if (macEnvironmentTask) return macEnvironmentTask
  macEnvironmentTask = new Promise<void>((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh'
    execFile(
      shell,
      ['-ilc', `printf '\\n${MAC_PATH_MARKER}%s\\n' "$PATH"`],
      { env: process.env, timeout: 3_000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (!error) {
          const markerAt = stdout.lastIndexOf(MAC_PATH_MARKER)
          if (markerAt >= 0) {
            const loginPath = stdout
              .slice(markerAt + MAC_PATH_MARKER.length)
              .split(/\r?\n/, 1)[0]
              ?.trim()
            const merged = [
              ...new Set([...searchPath({ PATH: loginPath }, 'darwin'), ...searchPath(process.env, 'darwin')]),
            ]
            if (merged.length > 0) process.env.PATH = merged.join(':')
          }
        }
        resolve()
      }
    )
  })
  return macEnvironmentTask
}

export async function detectAgents(): Promise<AgentInfo[]> {
  await hydrateTerminalEnvironment()
  const claude = resolveCommand('claude')
  const codex = resolveCommand('codex')
  const shell = shellSpec(process.env, process.platform)
  return [
    { id: 'claude', command: claude ?? 'claude', available: claude !== undefined },
    { id: 'codex', command: codex ?? 'codex', available: codex !== undefined },
    { id: 'shell', command: shell.command, available: true },
  ]
}
