import chalk from 'chalk'
import { readGlobalConfig, type GlobalConfig } from '../config.js'
import { apiFetch } from '../api.js'
import { selectPrompt } from './select.js'

interface Workspace {
  id: string
  name: string
}

export async function fetchWorkspaces(globalConfig: GlobalConfig): Promise<Workspace[]> {
  const res = await apiFetch(globalConfig, '/workspaces')

  if (!res.ok) {
    throw new Error(`Failed to fetch workspaces: ${res.status} ${res.statusText}`)
  }

  return (await res.json()) as Workspace[]
}

export async function fetchWorkspace(globalConfig: GlobalConfig, id: string): Promise<Workspace> {
  const workspaces = await fetchWorkspaces(globalConfig)
  const workspace = workspaces.find((ws) => ws.id === id)
  if (!workspace) {
    throw new Error(`Workspace not found: ${id}`)
  }
  return workspace
}

export interface ResolveWorkspaceOptions {
  id?: string
  name?: string
  promptTitle?: string
}

export async function resolveWorkspace(globalConfig: GlobalConfig, opts: ResolveWorkspaceOptions): Promise<Workspace> {
  if (opts.id) {
    return await fetchWorkspace(globalConfig, opts.id)
  }

  const workspaces = await fetchWorkspaces(globalConfig)

  if (workspaces.length === 0) {
    throw new Error('No workspaces found.')
  }

  if (opts.name) {
    const matches = workspaces.filter((ws) => ws.name === opts.name)
    if (matches.length === 0) {
      throw new Error(`No workspace named "${opts.name}".`)
    }
    if (matches.length > 1) {
      const lines = matches.map((ws) => `  ${ws.id}  ${ws.name}`).join('\n')
      throw new Error(`Multiple workspaces named "${opts.name}". Use --id instead:\n${lines}`)
    }
    return matches[0]
  }

  const selected = await selectPrompt(
    opts.promptTitle ?? 'Select a workspace:',
    workspaces.map((ws) => ({ label: ws.name, value: ws.id, hint: ws.id }))
  )

  return workspaces.find((ws) => ws.id === selected)!
}

export async function workspacesCommand(opts: { json?: boolean }): Promise<void> {
  const config = await readGlobalConfig()
  const workspaces = await fetchWorkspaces(config)

  if (opts.json) {
    console.log(JSON.stringify(workspaces, null, 2))
    return
  }

  if (workspaces.length === 0) {
    console.log(chalk.dim('No workspaces found.'))
    return
  }

  for (const ws of workspaces) {
    console.log(`${ws.name} ${chalk.dim(ws.id)}`)
  }
}
