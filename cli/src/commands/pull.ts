import * as readline from 'readline/promises'
import fs from 'fs/promises'
import chalk from 'chalk'
import { readGlobalConfig, tryReadLocalConfig, writeLocalConfig, type GlobalConfig } from '../config.js'
import { apiFetch } from '../api.js'
import { connect } from '../connection.js'
import { createIgnoreMatcher, flattenFSNode, hashContent, writeFSNodeToDir } from '../fs-utils.js'
import { workspaceToFilesystem } from 'shared/server'
import { fetchWorkspace, fetchWorkspaces } from './workspaces.js'
import { selectPrompt } from './select.js'

export interface PullOptions {
  id?: string
  name?: string
  /** Skip non-empty directory warning (used when caller already confirmed) */
  skipConfirm?: boolean
}

async function resolveWorkspace(globalConfig: GlobalConfig, opts: PullOptions): Promise<{ id: string; name: string }> {
  // By ID — validate it exists and get the name
  if (opts.id) {
    return await fetchWorkspace(globalConfig, opts.id)
  }

  const workspaces = await fetchWorkspaces(globalConfig)

  if (workspaces.length === 0) {
    console.error(chalk.red('No workspaces found.'))
    process.exit(1)
  }

  // By name
  if (opts.name) {
    const matches = workspaces.filter((ws) => ws.name === opts.name)
    if (matches.length === 0) {
      console.error(chalk.red(`No workspace named "${opts.name}".`))
      process.exit(1)
    }
    if (matches.length > 1) {
      console.error(chalk.red(`Multiple workspaces named "${opts.name}". Use --id instead:`))
      for (const ws of matches) {
        console.error(`  ${ws.id}  ${ws.name}`)
      }
      process.exit(1)
    }
    return matches[0]
  }

  // Interactive picker
  const selected = await selectPrompt(
    'Select a workspace:',
    workspaces.map((ws) => ({ label: ws.name, value: ws.id, hint: ws.id }))
  )

  const workspace = workspaces.find((ws) => ws.id === selected)!
  return workspace
}

async function isDirectoryNonEmpty(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir)
  return entries.some((e) => !e.startsWith('.'))
}

export async function pullCommand(opts: PullOptions = {}): Promise<void> {
  const globalConfig = await readGlobalConfig()
  const localConfig = await tryReadLocalConfig()
  const targetDir = process.cwd()

  // Resolve which workspace to pull
  let workspaceId: string
  let workspaceName: string

  if (!opts.id && !opts.name && localConfig) {
    // Re-pull same workspace
    workspaceId = localConfig.workspaceId
    workspaceName = localConfig.workspaceName
    console.log(chalk.dim(`Pulling workspace: ${workspaceName}`))
  } else {
    const workspace = await resolveWorkspace(globalConfig, opts)
    workspaceId = workspace.id
    workspaceName = workspace.name
  }

  // Non-empty directory warning (only on first pull)
  if (!opts.skipConfirm && !localConfig && (await isDirectoryNonEmpty(targetDir))) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(
      chalk.yellow('This directory is not empty. Files may be overwritten. Continue? (y/N) ')
    )
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      process.exit(0)
    }
  }

  console.log(chalk.dim('Connecting to workspace...'))
  const connection = await connect({ yjsServerHost: globalConfig.yjsServerHost, workspaceId, globalConfig })

  try {
    console.log(chalk.dim('Converting workspace to files...'))

    const fileFetcher = async (storagePath: string): Promise<Buffer> => {
      const response = await apiFetch(globalConfig, `/files/signed-url?path=${encodeURIComponent(storagePath)}`)
      if (!response.ok) throw new Error(`Failed to get signed URL: ${response.statusText}`)
      const data = (await response.json()) as { url: string }
      const fileResponse = await fetch(data.url)
      if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.statusText}`)
      return Buffer.from(await fileResponse.arrayBuffer())
    }

    const fsTree = await workspaceToFilesystem(connection.proxy, connection.yDoc, {
      fileFetcher,
    })

    const matcher = createIgnoreMatcher(localConfig?.ignore)
    const count = await writeFSNodeToDir(fsTree, targetDir, matcher)

    // Build snapshot from pulled content (excluding ignored files)
    const files = flattenFSNode(fsTree, '', matcher)
    const snapshot: Record<string, string> = {}
    for (const [relPath, content] of files) {
      snapshot[relPath] = hashContent(content)
    }

    await writeLocalConfig({ workspaceId, workspaceName, snapshot, ignore: localConfig?.ignore })

    console.log(chalk.green(`Pulled ${count} files to ${targetDir}`))
  } finally {
    connection.disconnect()
  }
}
