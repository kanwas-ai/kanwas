import * as readline from 'readline/promises'
import fs from 'fs/promises'
import chalk from 'chalk'
import { readGlobalConfig, tryReadLocalConfig } from '../config.js'
import { apiFetch } from '../api.js'
import { pullCommand } from './pull.js'

interface Workspace {
  id: string
  name: string
}

export async function newCommand(name: string): Promise<void> {
  const globalConfig = await readGlobalConfig()

  // Warn if directory already has content or is bound to a workspace
  const localConfig = await tryReadLocalConfig()
  if (localConfig) {
    throw new Error(
      `This directory is already bound to workspace "${localConfig.workspaceName}". Use a different directory, or clean up this directory and .kanwas.json first.`
    )
  }

  const entries = await fs.readdir(process.cwd())
  if (entries.some((e) => !e.startsWith('.'))) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(
      chalk.yellow('This directory is not empty. Files from the workspace will be added here. Continue? (y/N) ')
    )
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      process.exit(0)
    }
  }

  console.log(chalk.dim(`Creating workspace "${name}"...`))

  const res = await apiFetch(globalConfig, '/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  if (!res.ok) {
    throw new Error(`Failed to create workspace: ${res.status} ${res.statusText}`)
  }

  const workspace = (await res.json()) as Workspace
  console.log(chalk.green(`Created workspace "${workspace.name}" (${workspace.id})`))

  await pullCommand({ id: workspace.id, skipConfirm: true })
}
