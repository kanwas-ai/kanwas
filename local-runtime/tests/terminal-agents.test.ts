import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { agentSpawnSpec, detectAgents, isAgentId, quoteForCmd, resolveCommand } from '../src/terminal/agents.js'

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function fakeBin(name: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanwas-runtime-agent-bin-'))
  tmpDirs.push(dir)
  const file = path.join(dir, name)
  fs.writeFileSync(file, '')
  return { dir, file }
}

describe('terminal agents', () => {
  it('shell is always reported available (no external dependency)', async () => {
    const agents = await detectAgents()
    expect(agents.map((a) => a.id).sort()).toEqual(['claude', 'codex', 'shell'])
    const shell = agents.find((a) => a.id === 'shell')
    expect(shell?.available).toBe(true)
    expect(shell?.command.length).toBeGreaterThan(0)
  })

  it('isAgentId narrows only the known ids', () => {
    expect(isAgentId('claude')).toBe(true)
    expect(isAgentId('codex')).toBe(true)
    expect(isAgentId('shell')).toBe(true)
    expect(isAgentId('nope')).toBe(false)
    expect(isAgentId('')).toBe(false)
  })

  it('resolves Windows commands using PATHEXT and semicolon-separated PATH', () => {
    const { dir, file } = fakeBin('codex.cmd')
    const env = { PATH: `${path.join(dir, 'missing')};${dir}`, PATHEXT: '.EXE;.CMD' }
    expect(resolveCommand('codex', env, 'win32')).toBe(file)
  })

  it.skipIf(process.platform === 'win32')('requires the executable bit for commands on POSIX', () => {
    const { dir, file } = fakeBin('codex')
    const env = { PATH: dir }
    fs.chmodSync(file, 0o600)
    expect(resolveCommand('codex', env, 'linux')).toBeUndefined()

    fs.chmodSync(file, 0o700)
    expect(resolveCommand('codex', env, 'linux')).toBe(file)
  })

  it('runs cmd and bat shims through ComSpec with explicit quoting', () => {
    const { dir, file } = fakeBin('claude.cmd')
    const env = { PATH: dir, PATHEXT: '.CMD', ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    expect(agentSpawnSpec('claude', env, 'win32')).toEqual({
      command: env.ComSpec,
      args: ['/d', '/s', '/c', quoteForCmd(file)],
    })
    expect(quoteForCmd('a path\\with "quotes"')).toBe('"a path\\with ""quotes"""')
  })

  it.skipIf(process.platform === 'win32')(
    'injects the Kanwas MCP endpoint into Codex without persisting config',
    () => {
      const { dir, file } = fakeBin('codex')
      fs.chmodSync(file, 0o700)
      const mcpUrl = 'http://127.0.0.1:4300/mcp'

      expect(agentSpawnSpec('codex', { PATH: dir }, 'linux', { mcpUrl })).toEqual({
        command: file,
        args: ['-c', `mcp_servers.kanwas.url=${JSON.stringify(mcpUrl)}`],
      })
    }
  )

  it.skipIf(process.platform === 'win32')(
    'injects the Kanwas MCP endpoint into Claude Code without replacing other config',
    () => {
      const { dir, file } = fakeBin('claude')
      fs.chmodSync(file, 0o700)
      const mcpUrl = 'http://127.0.0.1:4300/mcp'

      expect(agentSpawnSpec('claude', { PATH: dir }, 'linux', { mcpUrl })).toEqual({
        command: file,
        args: ['--mcp-config', JSON.stringify({ mcpServers: { kanwas: { type: 'http', url: mcpUrl } } })],
      })
    }
  )

  it('preserves injected MCP arguments when launching a Windows command shim', () => {
    const { dir, file } = fakeBin('codex.cmd')
    const env = { PATH: dir, PATHEXT: '.CMD', ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
    const mcpUrl = 'http://127.0.0.1:4300/mcp'
    const configOverride = `mcp_servers.kanwas.url=${JSON.stringify(mcpUrl)}`

    expect(agentSpawnSpec('codex', env, 'win32', { mcpUrl })).toEqual({
      command: env.ComSpec,
      args: ['/d', '/s', '/c', [quoteForCmd(file), quoteForCmd('-c'), quoteForCmd(configOverride)].join(' ')],
    })
  })

  it('prefers PowerShell for the Windows shell and falls back to ComSpec', () => {
    const { dir, file } = fakeBin('pwsh.exe')
    expect(agentSpawnSpec('shell', { PATH: dir, PATHEXT: '.EXE' }, 'win32')).toEqual({
      command: file,
      args: ['-NoLogo'],
    })
    expect(agentSpawnSpec('shell', { PATH: '', ComSpec: 'custom-cmd.exe' }, 'win32')).toEqual({
      command: 'custom-cmd.exe',
      args: [],
    })
  })
})
