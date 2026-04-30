import chalk from 'chalk'
import { readGlobalConfig, type GlobalConfig } from '../config.js'
import { apiFetch } from '../api.js'

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
